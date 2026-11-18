import { rateLimitService } from "@/backend/services/security/rate-limit";

import type { MiddlewareFunction } from "./types";

// The client address is the first x-forwarded-for hop, else x-real-ip, else a
// shared "unknown" bucket. This assumes deployment behind a proxy that sets the
// header; see BACKEND_PATTERNS.md.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimitMiddleware(options: {
  scope: string;
  limit: number;
  windowSeconds: number;
}): MiddlewareFunction {
  return async (request) => {
    const result = await rateLimitService.hit({
      scope: options.scope,
      clientIp: clientIp(request.headers),
      limit: options.limit,
      windowSeconds: options.windowSeconds,
    });
    if (!result.allowed) {
      return {
        next: false,
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many requests",
      };
    }
    return { message: "", statusCode: 200, next: true };
  };
}
