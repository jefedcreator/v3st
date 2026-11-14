import type { NextRequest } from "next/server";

import type { ErrorCode } from "@/types";
import type { Session, User } from "../../../generated/prisma";

export type AuthenticatedUser = User & { session: Session };

export type QueryParameters = Record<string, string>;

export interface AuthRequest<B = unknown, Q = QueryParameters> extends NextRequest {
  parsedBody?: B;
  query?: Q;
  params?: Record<string, string>;
  validatedData?: unknown;
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

export type MiddlewareFunction<B = unknown, Q = QueryParameters> = (
  req: AuthRequest<B, Q>,
) => Promise<MiddlewareResponse>;
