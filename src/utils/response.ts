import { NextResponse } from "next/server";

import type { ApiResponse, PaginatedApiResponse } from "@/types";

export function ok<T>(data: T, message: string, status = 200): NextResponse {
  const body: ApiResponse<T> = { status, message, data };
  return NextResponse.json(body, { status });
}

export function created<T>(data: T, message: string): NextResponse {
  return ok(data, message, 201);
}

export function accepted<T>(data: T, message: string): NextResponse {
  return ok(data, message, 202);
}

export function paginated<T>(
  data: T,
  message: string,
  page: number,
  size: number,
  total: number,
): NextResponse {
  const body: PaginatedApiResponse<T> = {
    status: 200,
    message,
    data,
    total,
    page,
    size,
    totalPages: Math.ceil(total / size),
  };
  return NextResponse.json(body, { status: 200 });
}
