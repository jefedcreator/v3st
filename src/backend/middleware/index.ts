import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { type z } from "zod";

import { logRequest, reportError } from "@/backend/observability";
import { env } from "@/env";
import { authService } from "@/backend/services/auth";
import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import type { ApiErrorResponse, ErrorCode } from "@/types";
import { redact } from "@/utils";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  PayloadTooLargeException,
  UnauthorizedException,
} from "@/utils/exceptions";

import type {
  AuthRequest,
  MiddlewareFunction,
  MiddlewareResponse,
  PathParameters,
  QueryParameters,
} from "./types";

const DEFAULT_MAX_BODY_BYTES = 65_536;

type Handler<B, P, Q> = (
  request: AuthRequest<B, P, Q>,
  context: { params: P | undefined },
) => Promise<Response>;

type WithMiddlewareOptions = {
  bodyMode?: "json" | "raw" | "none";
  maxBodyBytes?: number;
};

function statusToCode(status: number): ErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 422) return "VALIDATION_FAILED";
  return "INTERNAL";
}

function errorJson(
  status: number,
  message: string,
  code: ErrorCode,
  requestId: string,
): NextResponse {
  const body: ApiErrorResponse = { status, message, code, data: null };
  return NextResponse.json(body, {
    status,
    headers: { "X-Request-Id": requestId },
  });
}

export const withMiddleware = <B = null, P = null, Q = null>(
  handler: Handler<B, P, Q>,
  middlewares: MiddlewareFunction<B, P, Q>[],
  options?: WithMiddlewareOptions,
) => {
  const bodyMode = options?.bodyMode ?? "json";
  const maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const executeRequest = async (
    req: unknown,
    context: { params?: Promise<Record<string, string>> } | undefined,
  ): Promise<Response> => {
    const request = req as AuthRequest<B, P, Q>;
    request.requestId = randomUUID();
    try {
      const resolvedParams = await (context?.params ?? Promise.resolve({}));
      request.parsedParams = resolvedParams;

      const url = new URL(request.url);
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      request.parsedQuery = query;

      // Authenticate before parsing or validating untrusted financial input.
      const authenticateFirst = middlewares[0] === authMiddleware;
      if (authenticateFirst) {
        const result = await authMiddleware(request);
        if (!result.next) return errorJson(result.statusCode, result.message, result.code ?? statusToCode(result.statusCode), request.requestId);
      }

      if (
        bodyMode !== "none" &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > maxBodyBytes) {
          throw new PayloadTooLargeException(
            `Request body exceeds ${maxBodyBytes} bytes`,
          );
        }
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.length > maxBodyBytes) {
          throw new PayloadTooLargeException(
            `Request body exceeds ${maxBodyBytes} bytes`,
          );
        }
        if (bodyMode === "raw") {
          request.rawBody = bytes;
        } else if (bytes.length === 0) {
          request.parsedBody = {};
        } else {
          const text = new TextDecoder().decode(bytes);
          try {
            request.parsedBody = JSON.parse(text);
          } catch {
            throw new BadRequestException("Malformed JSON body", "MALFORMED_JSON");
          }
        }
      }

      for (const middleware of middlewares.slice(authenticateFirst ? 1 : 0)) {
        const result = await middleware(request);
        if (!result.next) {
          return errorJson(
            result.statusCode,
            result.message,
            result.code ?? statusToCode(result.statusCode),
            request.requestId,
          );
        }
      }

      const response = await handler(request, { params: request.params });
      response.headers.set("X-Request-Id", request.requestId);
      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        if (error.statusCode >= 500) {
          reportError(error, {
            requestId: request.requestId,
            method: request.method,
            url: request.url,
          });
        }
        return errorJson(error.statusCode, error.message, error.code, request.requestId);
      }
      reportError(error, {
        requestId: request.requestId,
        method: request.method,
        url: request.url,
      });
      const internal = new InternalServerErrorException(
        error instanceof Error ? error.message : String(error),
      );
      return errorJson(internal.statusCode, internal.message, internal.code, request.requestId);
    }
  };

  return async (
    req: unknown,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const start = Date.now();
    const request = req as AuthRequest<B, P, Q>;
    const method = request.method;
    const parsed = new URL(request.url);
    const path = `${parsed.pathname}${parsed.search}`;
    const response = await executeRequest(req, context);
    const duration = Date.now() - start;
    logRequest(method, path, response.status, duration, redact(request.parsedBody));
    return response;
  };
};

export const bodyValidatorMiddleware =
  <B>(schema: z.ZodType<B, z.ZodTypeDef, unknown>) =>
  async (
    request: Pick<AuthRequest<B>, "parsedBody" | "validatedData">,
  ): Promise<MiddlewareResponse> => {
    const result = schema.safeParse(request.parsedBody ?? {});
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join(".");
      return {
        message: path ? `${path}: ${first?.message}` : (first?.message ?? "Validation failed"),
        statusCode: 422,
        next: false,
        code: "VALIDATION_FAILED",
      };
    }
    request.validatedData = result.data;
    return { message: "", statusCode: 200, next: true };
  };

export const queryValidatorMiddleware =
  <Q>(schema: z.ZodType<Q, z.ZodTypeDef, unknown>) =>
  async (
    request: Pick<AuthRequest<null, null, Q>, "parsedQuery" | "query">,
  ): Promise<MiddlewareResponse> => {
    const result = schema.safeParse(request.parsedQuery ?? {});
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join(".");
      return {
        message: path ? `${path}: ${first?.message}` : (first?.message ?? "Validation failed"),
        statusCode: 422,
        next: false,
        code: "VALIDATION_FAILED",
      };
    }
    request.query = result.data;
    return { message: "", statusCode: 200, next: true };
  };

export const pathParamValidatorMiddleware =
  <P>(schema: z.ZodType<P, z.ZodTypeDef, unknown>) =>
  async (
    request: Pick<AuthRequest<null, P>, "parsedParams" | "params">,
  ): Promise<MiddlewareResponse> => {
    const result = schema.safeParse(request.parsedParams ?? {});
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join(".");
      return {
        message: path ? `${path}: ${first?.message}` : (first?.message ?? "Validation failed"),
        statusCode: 422,
        next: false,
        code: "VALIDATION_FAILED",
      };
    }
    request.params = result.data;
    return { message: "", statusCode: 200, next: true };
  };

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const idempotencyKeyMiddleware = async <B, P, Q>(
  request: AuthRequest<B, P, Q>,
): Promise<MiddlewareResponse> => {
  const key = request.headers.get("idempotency-key");
  if (!key) {
    return {
      message: "Idempotency-Key header is required",
      statusCode: 400,
      next: false,
      code: "IDEMPOTENCY_KEY_REQUIRED",
    };
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return {
      message: "Idempotency-Key header is malformed",
      statusCode: 400,
      next: false,
      code: "BAD_REQUEST",
    };
  }
  request.idempotencyKey = key;
  return { message: "", statusCode: 200, next: true };
};

export const authMiddleware = async <B, P, Q>(
  request: AuthRequest<B, P, Q>,
): Promise<MiddlewareResponse> => {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let sessionToken: string | undefined;
  if (cookieToken) {
    sessionToken = cookieToken;
  } else {
    const header = request.headers.get("authorization");
    const bearer = header?.replace(/^Bearer\s+/i, "").trim();
    if (bearer) {
      sessionToken = bearer;
    }
  }
  if (!sessionToken || sessionToken === "undefined" || sessionToken === "null") {
    throw new UnauthorizedException("Unauthorized");
  }
  try {
    const user = await authService.authenticate(sessionToken);
    request.user = user;
    request.authTransport = cookieToken ? "cookie" : "bearer";
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new UnauthorizedException("Invalid auth token");
  }
  return { message: "", statusCode: 200, next: true };
};

export const optionalAuthMiddleware = async <B, P, Q>(
  request: AuthRequest<B, P, Q>,
): Promise<MiddlewareResponse> => {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let sessionToken: string | undefined;
  if (cookieToken) {
    sessionToken = cookieToken;
  } else {
    const header = request.headers.get("authorization");
    const bearer = header?.replace(/^Bearer\s+/i, "").trim();
    if (bearer) sessionToken = bearer;
  }
  if (!sessionToken || sessionToken === "undefined" || sessionToken === "null") {
    request.user = null;
    return { message: "", statusCode: 200, next: true };
  }
  try {
    request.user = await authService.authenticate(sessionToken);
    request.authTransport = cookieToken ? "cookie" : "bearer";
  } catch {
    request.user = null;
  }
  return { message: "", statusCode: 200, next: true };
};

export const operatorMiddleware = async <B, P, Q>(
  request: AuthRequest<B, P, Q>,
): Promise<MiddlewareResponse> => {
  if (request.user?.role !== "operator") {
    throw new ForbiddenException("Operator role required");
  }
  return { message: "", statusCode: 200, next: true };
};

export const originMiddleware = async <B, P, Q>(
  request: AuthRequest<B, P, Q>,
): Promise<MiddlewareResponse> => {
  if (
    request.authTransport === "cookie" &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    const expected = new URL(env.NEXT_PUBLIC_APP_URL).origin;
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== expected) {
      return {
        message: "Cross-origin request rejected",
        statusCode: 403,
        next: false,
        code: "CROSS_ORIGIN",
      };
    }
  }
  return { message: "", statusCode: 200, next: true };
};

export type {
  AuthRequest,
  MiddlewareFunction,
  MiddlewareResponse,
  PathParameters,
  QueryParameters,
};
