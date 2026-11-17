import { randomUUID } from "node:crypto";

import { db } from "@/server/db";
import { now } from "@/backend/clock";

// Runs `fn` while holding the named lease, or returns null when another holder's
// lease is still live. Acquiring and releasing are single statements, so no
// database transaction stays open while `fn` waits on external calls. A holder that
// crashes leaves a lease that simply expires after `ttlSeconds`.
export async function withLease<T>(name: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | null> {
  const holder = randomUUID();
  const at = now();
  const expiresAt = new Date(at.getTime() + ttlSeconds * 1_000);
  const acquired = await db.$executeRaw`
    INSERT INTO "worker_leases" ("name", "holder", "expiresAt")
    VALUES (${name}, ${holder}, ${expiresAt})
    ON CONFLICT ("name") DO UPDATE
      SET "holder" = EXCLUDED."holder", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "worker_leases"."expiresAt" <= ${at}`;
  if (acquired === 0) return null;
  try {
    return await fn();
  } finally {
    await db.$executeRaw`DELETE FROM "worker_leases" WHERE "name" = ${name} AND "holder" = ${holder}`;
  }
}
