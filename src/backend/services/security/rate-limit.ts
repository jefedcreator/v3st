import { createHmac } from "node:crypto";

import { now } from "@/backend/clock";
import { env } from "@/env";
import { withTx } from "@/server/db";

// Keyed hash of scope and client address: the bucket table never stores a raw IP.
export function rateLimitKey(scope: string, clientIp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${scope}:${clientIp}`).digest("hex");
}

const DAY_MS = 86_400_000;

export const rateLimitService = {
  // Fixed-window counter: windowStart is the request time rounded down to a
  // multiple of windowSeconds. A hit is allowed while count <= limit. Buckets
  // older than a day are deleted in the same transaction.
  async hit(input: {
    scope: string;
    clientIp: string;
    limit: number;
    windowSeconds: number;
    at?: Date;
  }): Promise<{ allowed: boolean; count: number; resetAt: Date }> {
    const at = input.at ?? now();
    const windowMs = input.windowSeconds * 1000;
    const windowStart = new Date(Math.floor(at.getTime() / windowMs) * windowMs);
    const resetAt = new Date(windowStart.getTime() + windowMs);
    const key = rateLimitKey(input.scope, input.clientIp, env.RATE_LIMIT_SECRET);
    return withTx(async (tx) => {
      await tx.rateLimitBucket.deleteMany({
        where: { windowStart: { lt: new Date(at.getTime() - DAY_MS) } },
      });
      const existing = await tx.rateLimitBucket.findUnique({
        where: { key_windowStart: { key, windowStart } },
      });
      const count = (existing?.count ?? 0) + 1;
      await tx.rateLimitBucket.upsert({
        where: { key_windowStart: { key, windowStart } },
        create: { key, windowStart, count },
        update: { count },
      });
      return { allowed: count <= input.limit, count, resetAt };
    });
  },
};
