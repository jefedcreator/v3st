import { afterEach, expect, it, vi } from "vitest";

import { POST as sessionPOST } from "@/app/api/v1/auth/session/route";
import { GET as meGET } from "@/app/api/v1/me/route";
import { authMiddleware, operatorMiddleware, withMiddleware } from "@/backend/middleware";
import { authService } from "@/backend/services/auth";
import { db } from "@/server/db";
import { ok } from "@/utils/response";

import { useTestDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setNow } from "../helpers/time";

useTestDatabase();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("signs up a test phone, opens a session and queues wallet provisioning", async () => {
  setNow("2026-11-13T07:00:00Z");
  const { token } = authService.issueBetaIdentityToken("+2340000000001");
  const res = await callRoute(sessionPOST, {
    method: "POST",
    url: "/api/v1/auth/session",
    body: JSON.stringify({ identity_token: token }),
    headers: { Origin: "http://localhost:3000" },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toMatch(
    /^sara-session=[A-Za-z0-9_-]{43}; .*HttpOnly.*SameSite=lax/i,
  );
  expect(await db.user.count()).toBe(1);
  expect(await db.job.count({ where: { kind: "wallets.provision" } })).toBe(1);
});

it("signs an existing identity in without a second user", async () => {
  setNow("2026-11-13T07:00:00Z");
  const token = authService.issueBetaIdentityToken("+2340000000002").token;
  const first = await authService.signIn(token);
  const second = await authService.signIn(token);
  expect(await db.user.count()).toBe(1);
  expect(await db.session.count()).toBe(2);
  expect([first.created, second.created]).toEqual([true, false]);
});

it("rejects phones outside the beta test range", async () => {
  expect(() => authService.issueBetaIdentityToken("+2348031234567")).toThrow(
    expect.objectContaining({ code: "TEST_PHONE_REQUIRED" }),
  );
});

it("rejects forged and expired identity tokens", async () => {
  setNow("2026-11-13T07:00:00Z");
  const { token } = authService.issueBetaIdentityToken("+2340000000003");
  const forged = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  await expect(authService.signIn(forged)).rejects.toMatchObject({ statusCode: 401 });
  setNow("2026-11-13T07:05:01Z"); // +301 s
  await expect(authService.signIn(token)).rejects.toMatchObject({ statusCode: 401 });
});

it("marks the cookie Secure in production", async () => {
  setNow("2026-11-13T07:00:00Z");
  vi.stubEnv("NODE_ENV", "production");
  const { token } = authService.issueBetaIdentityToken("+2340000000004");
  const res = await callRoute(sessionPOST, {
    method: "POST",
    url: "/api/v1/auth/session",
    body: JSON.stringify({ identity_token: token }),
  });
  expect(res.headers.get("set-cookie")).toContain("Secure");
});

it("never falls back to a bearer token when the cookie is invalid", async () => {
  setNow("2026-11-13T07:00:00Z");
  const good = (
    await authService.signIn(authService.issueBetaIdentityToken("+2340000000005").token)
  ).sessionToken;
  const res = await callRoute(meGET, {
    method: "GET",
    url: "/api/v1/me",
    cookie: "sara-session=bogus",
    headers: { Authorization: `Bearer ${good}` },
  });
  expect(res.status).toBe(401);
});

it("rejects and deletes an expired session", async () => {
  setNow("2026-11-13T07:00:00Z");
  const { sessionToken } = await authService.signIn(
    authService.issueBetaIdentityToken("+2340000000006").token,
  );
  setNow("2026-12-14T07:00:01Z"); // +31 days
  await expect(authService.authenticate(sessionToken)).rejects.toMatchObject({
    statusCode: 401,
  });
  expect(await db.session.count()).toBe(0);
});

it("revokes the session on logout", async () => {
  setNow("2026-11-13T07:00:00Z");
  const { sessionToken } = await authService.signIn(
    authService.issueBetaIdentityToken("+2340000000007").token,
  );
  await authService.logout(sessionToken);
  await expect(authService.authenticate(sessionToken)).rejects.toMatchObject({
    statusCode: 401,
  });
});

it("returns 403 to non-operators", async () => {
  setNow("2026-11-13T07:00:00Z");
  const { sessionToken } = await authService.signIn(
    authService.issueBetaIdentityToken("+2340000000008").token,
  );
  const route = withMiddleware(async () => ok({}, "ok"), [authMiddleware, operatorMiddleware]);
  const res = await callRoute(route, {
    method: "GET",
    url: "/api/v1/ops/x",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: "FORBIDDEN" });
});
