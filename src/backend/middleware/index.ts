import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

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
  QueryParameters,
} from "./types";

const DEFAULT_MAX_BODY_BYTES = 65_536;

type Handler<B, Q> = (
  request: AuthRequest<B, Q>,
  context: { params: Record<string, string> },
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

export const withMiddleware = <B = unknown, Q = QueryParameters>(
  handler: Handler<B, Q>,
  middlewares: MiddlewareFunction<B, Q>[],
  options?: WithMiddlewareOptions,
) => {
  const bodyMode = options?.bodyMode ?? "json";
  const maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const executeRequest = async (
    req: unknown,
    context: { params?: Promise<Record<string, string>> } | undefined,
  ): Promise<Response> => {
    const request = req as AuthRequest<B, Q>;
    request.requestId = randomUUID();
    try {
      const resolvedParams = await (context?.params ?? Promise.resolve({}));
      request.params = resolvedParams;

      const url = new URL(request.url);
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      request.query = query as Q;

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
          request.parsedBody = {} as B;
        } else {
          const text = new TextDecoder().decode(bytes);
          try {
            request.parsedBody = JSON.parse(text) as B;
          } catch {
            throw new BadRequestException("Malformed JSON body", "MALFORMED_JSON");
          }
        }
      }

      for (const middleware of middlewares) {
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

      const response = await handler(request, { params: request.params ?? {} });
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
    context: { params?: Promise<Record<string, string>> } | undefined,
  ): Promise<Response> => {
    const start = Date.now();
    const request = req as AuthRequest<B, Q>;
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
  <B extends z.ZodTypeAny>(schema: B) =>
  async (request: AuthRequest<z.infer<B>, unknown>): Promise<MiddlewareResponse> => {
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
  <Q extends z.ZodTypeAny>(schema: Q) =>
  async (request: AuthRequest<unknown, z.infer<Q>>): Promise<MiddlewareResponse> => {
    const result = schema.safeParse(request.query ?? {});
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
  <P extends z.ZodTypeAny>(schema: P) =>
  async (request: AuthRequest<unknown, unknown>): Promise<MiddlewareResponse> => {
    const result = schema.safeParse(request.params ?? {});
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
    return { message: "", statusCode: 200, next: true };
  };

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const idempotencyKeyMiddleware = async <B, Q>(
  request: AuthRequest<B, Q>,
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

export const authMiddleware = async <B, Q>(
  request: AuthRequest<B, Q>,
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

export const optionalAuthMiddleware = async <B, Q>(
  request: AuthRequest<B, Q>,
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

export const operatorMiddleware = async <B, Q>(
  request: AuthRequest<B, Q>,
): Promise<MiddlewareResponse> => {
  if (request.user?.role !== "operator") {
    throw new ForbiddenException("Operator role required");
  }
  return { message: "", statusCode: 200, next: true };
};

export const originMiddleware = async <B, Q>(
  request: AuthRequest<B, Q>,
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

export type { AuthRequest, MiddlewareFunction, MiddlewareResponse, QueryParameters };
