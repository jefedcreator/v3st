import { describe, expect, it } from "vitest";

import { rateLimitMiddleware, withMiddleware } from "@/backend/middleware";
import { clientIp } from "@/backend/middleware/rate-limit";
import { rateLimitKey, rateLimitService } from "@/backend/services/security/rate-limit";
import { env } from "@/env";
import { db } from "@/server/db";
import { ok } from "@/utils/response";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import { setNow } from "../helpers/time";

useTestDatabase();

const SECRET = env.RATE_LIMIT_SECRET;

function hit(at?: Date) {
  return rateLimitService.hit({
    scope: "t",
    clientIp: "203.0.113.5",
    limit: 5,
    windowSeconds: 600,
    at,
  });
}

describe("rate limiting", () => {
  it("derives a stable 64-character key per scope and address", () => {
    expect(rateLimitKey("waitlist", "203.0.113.5", SECRET)).toMatch(/^[0-9a-f]{64}$/);
    expect(rateLimitKey("waitlist", "203.0.113.5", SECRET)).not.toBe(
      rateLimitKey("other", "203.0.113.5", SECRET),
    );
  });

  it("reads the client address from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("allows five hits per window and refuses the sixth", async () => {
    setNow("2026-11-18T12:00:00Z");
    for (let i = 1; i <= 5; i++) expect((await hit()).allowed).toBe(true);
    expect((await hit()).allowed).toBe(false);
    setNow("2026-11-18T12:10:00Z");
    expect(await hit()).toMatchObject({ allowed: true, count: 1 });
  });

  it("deletes buckets older than a day", async () => {
    setNow("2026-11-18T12:00:00Z");
    await db.rateLimitBucket.create({
      data: {
        key: rateLimitKey("t", "203.0.113.5", SECRET),
        windowStart: new Date("2026-11-16T11:00:00Z"),
        count: 3,
      },
    });
    await hit();
    expect(
      await db.rateLimitBucket.count({ where: { windowStart: new Date("2026-11-16T11:00:00Z") } }),
    ).toBe(0);
  });

  it("never stores a raw address", async () => {
    setNow("2026-11-18T12:00:00Z");
    await hit();
    const keys = (await db.rateLimitBucket.findMany()).map((b) => b.key);
    expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k) && !k.includes("203.0.113.5"))).toBe(true);
  });

  it("answers the sixth request with TOO_MANY_TRIES", async () => {
    setNow("2026-11-18T12:00:00Z");
    const route = withMiddleware<null, null, null>(
      async () => ok({ ok: true }, "ok"),
      [rateLimitMiddleware({ scope: "t", limit: 5, windowSeconds: 600 })],
      { audience: "customer" },
    );
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 5; i++) {
      const res = await callRoute(route, { method: "GET", url: "/x", headers });
      expect(res.status).toBe(200);
    }
    const sixth = await callRoute(route, { method: "GET", url: "/x", headers });
    expect(sixth.status).toBe(429);
    expect(sixth.json).toMatchObject({
      code: "TOO_MANY_TRIES",
      message: "Too many tries. Please wait a few minutes and try again.",
    });
  });
});
