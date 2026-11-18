import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { GET as opsWaitlistGET } from "@/app/api/v1/ops/waitlist/route";
import { POST as waitlistPOST } from "@/app/api/v1/waitlist/route";
import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { db } from "@/server/db";
import type { WaitlistEntryDto } from "@/types/landing";

import { ORIGIN } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { makeUser } from "../helpers/factories";
import { callRoute } from "../helpers/http";

useTestDatabase();

let ipCounter = 0;

function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function join(
  body: Record<string, string>,
  opts?: { ip?: string; origin?: string },
): Promise<{ status: number; json: unknown; headers: Headers }> {
  return callRoute(waitlistPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/waitlist`,
    body,
    headers: {
      origin: opts?.origin ?? ORIGIN,
      "x-forwarded-for": opts?.ip ?? freshIp(),
    },
  });
}

function joinForm(body: string, opts?: { ip?: string }) {
  return callRoute(waitlistPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/waitlist`,
    body,
    headers: {
      origin: ORIGIN,
      "x-forwarded-for": opts?.ip ?? freshIp(),
      "content-type": "application/x-www-form-urlencoded",
    },
  });
}

async function sessionCookieFor(role: "user" | "operator"): Promise<string> {
  const user = await makeUser({ role });
  const sessionToken = randomBytes(32).toString("base64url");
  await db.session.create({
    data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 86_400_000) },
  });
  return `sara-session=${sessionToken}`;
}

async function exportList(cookie?: string) {
  return callRoute(opsWaitlistGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/ops/waitlist?page=1&size=20`,
    cookie,
  });
}

describe("POST /api/v1/waitlist", () => {
  it("adds a normalised email and answers the success envelope", async () => {
    const res = await join({ email: " Ada@Example.com " });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ message: "You're on the list.", data: { joined: true } });
    expect(await db.waitlistEntry.findUnique({ where: { email: "ada@example.com" } })).toMatchObject({
      source: "hero",
      privacyVersion: "2026-11-18",
    });
    expect(findCustomerLeaks(res.json)).toEqual([]);
  });

  it("answers a repeat identically and keeps one row", async () => {
    const first = await join({ email: "ada@example.com" });
    const second = await join({ email: " ADA@example.com" });
    expect(second.json).toEqual(first.json);
    expect(await db.waitlistEntry.count()).toBe(1);
  });

  it("answers a filled honeypot identically and stores nothing", async () => {
    const res = await join({ email: "bot@example.com", website: "spam" });
    expect(res.json).toMatchObject({ data: { joined: true } });
    expect(await db.waitlistEntry.count()).toBe(0);
  });

  it("rejects an invalid email with the email field message", async () => {
    const res = await join({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({
      code: "CHECK_DETAILS",
      message: "Enter a valid email address.",
    });
  });

  it("rejects an email longer than 254 characters", async () => {
    expect((await join({ email: `${"a".repeat(250)}@b.co` })).status).toBe(422);
  });

  it("rejects another origin", async () => {
    const res = await join({ email: "a@b.co" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await db.waitlistEntry.count()).toBe(0);
  });

  it("rate-limits the sixth request from one address", async () => {
    for (let i = 0; i < 5; i++) await join({ email: `p${i}@b.co` }, { ip: "203.0.113.9" });
    const sixth = await join({ email: "p6@b.co" }, { ip: "203.0.113.9" });
    expect(sixth.status).toBe(429);
    expect(sixth.json).toMatchObject({ code: "TOO_MANY_TRIES" });
  });

  it("redirects native form posts", async () => {
    const okRes = await joinForm("email=ada%40example.com&source=join");
    expect(okRes.headers.get("location")).toBe("http://localhost:3000/waitlist?status=joined");
    const badRes = await joinForm("email=nope");
    expect(badRes.headers.get("location")).toBe("http://localhost:3000/waitlist?status=check_details");
    expect((await db.waitlistEntry.findFirst())!.source).toBe("join");
  });
});

describe("GET /api/v1/ops/waitlist", () => {
  it("exports the list to operators only", async () => {
    expect((await exportList()).status).toBe(401);
    expect((await exportList(await sessionCookieFor("user"))).status).toBe(403);
    await join({ email: "first@example.com" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await join({ email: "second@example.com" });
    const res = await exportList(await sessionCookieFor("operator"));
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ total: 2, page: 1 });
    expect((res.json as { data: WaitlistEntryDto[] }).data[0]!.email).toBe("second@example.com");
  });
});
