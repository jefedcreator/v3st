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
  //
  // The increment is one INSERT … ON CONFLICT DO UPDATE … RETURNING statement,
  // so concurrent hits on the same bucket serialise on the row: no two requests
  // can read the same count, and two first hits cannot race to create the row.
  // The window start is passed as a UTC literal cast to timestamp(3): Prisma
  // stores DateTime as UTC wall-clock time in these columns, and the literal
  // keeps that true whatever the session time zone is.
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
      const rows = await tx.$queryRaw<Array<{ count: number }>>`
        INSERT INTO "rate_limit_buckets" ("key", "windowStart", "count")
        VALUES (${key}, ${windowStart.toISOString()}::timestamp(3), 1)
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = "rate_limit_buckets"."count" + 1
        RETURNING "count"`;
      const count = Number(rows[0]!.count);
      return { allowed: count <= input.limit, count, resetAt };
    });
  },
};
