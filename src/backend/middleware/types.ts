import type { NextRequest } from "next/server";

import type { EventsQuerySchema } from "@/backend/validators/events.validator";
import type {
  IdParamSchema,
  PaginationQuerySchema,
} from "@/backend/validators/index.validator";
import type { ErrorCode } from "@/types";
import type { Session, User } from "../../../generated/prisma";

export type AuthenticatedUser = User & { session: Session };

export type PathParameters = IdParamSchema;

export type QueryParameters = PaginationQuerySchema | EventsQuerySchema;

export interface AuthRequest<B = null, P = null, Q = null> extends NextRequest {
  parsedBody?: unknown;
  parsedParams?: Record<string, string>;
  parsedQuery?: Record<string, string>;
  query?: Q;
  params?: P;
  validatedData?: B;
  user: AuthenticatedUser | null;
  rawBody?: Uint8Array;
  idempotencyKey?: string;
  authTransport?: "cookie" | "bearer";
  requestId: string;
}

export type MiddlewareResponse = {
  message: string;
  statusCode: number;
  next: boolean;
  code?: ErrorCode;
};

export type MiddlewareFunction<B = null, P = null, Q = null> = (
  req: AuthRequest<B, P, Q>,
) => Promise<MiddlewareResponse>;
