import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { POST as privySignInPOST } from "@/app/api/v1/app/auth/privy/route";
import { PUT as pinPUT } from "@/app/api/v1/app/security/pin/route";
import { POST as pinResetPOST } from "@/app/api/v1/app/security/pin/reset/route";
import { GET as sessionsGET } from "@/app/api/v1/app/security/sessions/route";
import { DELETE as sessionDELETE } from "@/app/api/v1/app/security/sessions/[id]/route";
import { POST as signOutOthersPOST } from "@/app/api/v1/app/security/sessions/sign-out-others/route";
import { now } from "@/backend/clock";
import { securityService } from "@/backend/services/security";
import { simulatedPrivy } from "@/backend/services/privy/simulated";
import { db } from "@/server/db";
import { type HttpException } from "@/utils/exceptions";

import { callAppRoute, ORIGIN, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { makeUser } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

async function setPinViaRoute(cookie: string, body: unknown) {
  return callAppRoute(pinPUT, {
    method: "PUT",
    url: `${ORIGIN}/api/v1/app/security/pin`,
    cookie,
    body,
  });
}

describe("transaction PIN and device sessions", () => {
  it("sets a PIN and refuses weak or malformed ones", async () => {
    const { cookie, userId } = await signInCustomer();
    const ok = await setPinViaRoute(cookie, { pin: "1357" });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ data: { pin_set: true } });

    for (const weak of ["1234", "0000", "9876"]) {
      const res = await setPinViaRoute(cookie, { pin: weak, current_pin: "1357" });
      expect(res.status).toBe(422);
      expect((res.json as { code: string }).code).toBe("PIN_TOO_SIMPLE");
    }
    for (const malformed of ["12a4", "12345"]) {
      const res = await setPinViaRoute(cookie, { pin: malformed });
      expect(res.status).toBe(422);
      const body = res.json as { code: string; message: string };
      expect(body.code).toBe("CHECK_DETAILS");
      expect(body.message).toBe("Your PIN must be 4 digits.");
    }
    await securityService.verifyPin(userId, "1357");
  });

  it("requires the current PIN to change it", async () => {
    const { cookie, userId } = await signInCustomer("tunde@v3st.test");
    await securityService.setPin(userId, "1357", null);

    const missing = await setPinViaRoute(cookie, { pin: "2468" });
    expect(missing.status).toBe(409);
    expect((missing.json as { code: string }).code).toBe("PIN_NEEDED");

    await expect(securityService.verifyPin(userId, "9999")).rejects.toMatchObject({
      code: "PIN_INCORRECT",
    });
    const afterWrong = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterWrong.pinFailedAttempts).toBe(1);

    const changed = await setPinViaRoute(cookie, { pin: "2468", current_pin: "1357" });
    expect(changed.status).toBe(200);
    await securityService.verifyPin(userId, "2468");
  });

  it("locks after five wrong PINs and unlocks after 30 minutes", async () => {
    const { userId } = await signInCustomer("lockme@v3st.test");
    await securityService.setPin(userId, "1357", null);

    for (let i = 0; i < 4; i++) {
      await expect(securityService.verifyPin(userId, "2468")).rejects.toMatchObject({
        code: "PIN_INCORRECT",
      });
    }
    await expect(securityService.verifyPin(userId, "2468")).rejects.toMatchObject({
      code: "PIN_LOCKED",
      statusCode: 423,
    });
    await expect(securityService.verifyPin(userId, "1357")).rejects.toMatchObject({
      code: "PIN_LOCKED",
    });

    setNow(new Date(now().getTime() + 1_801_000).toISOString());
    await securityService.verifyPin(userId, "1357");
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.pinFailedAttempts).toBe(0);
    expect(user.pinLockedUntil).toBeNull();
  });

  it("never counts more than five failures under concurrency", async () => {
    const { userId } = await signInCustomer("race@v3st.test");
    await securityService.setPin(userId, "1357", null);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => securityService.verifyPin(userId, "2468")),
    );
    const codes = results.map((result) =>
      result.status === "rejected" ? (result.reason as HttpException).code : "ok",
    );
    expect(codes.filter((code) => code === "PIN_INCORRECT").length).toBe(4);
    expect(codes.filter((code) => code === "PIN_LOCKED").length).toBe(2);
  });

  it("resets the PIN after a fresh email sign-in and signs out other devices", async () => {
    const a = await signInCustomer("reset@v3st.test");
    const b = await signInCustomer("reset@v3st.test");
    await securityService.setPin(a.userId, "1357", null);
    await securityService.verifyPin(a.userId, "9999").catch(() => undefined);
    await securityService.verifyPin(a.userId, "9999").catch(() => undefined);

    const freshSid = randomUUID();
    const tokens = simulatedPrivy.mint("reset@v3st.test", { sessionId: freshSid });
    const res = await callAppRoute(pinResetPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/security/pin/reset`,
      cookie: a.cookie,
      body: { access_token: tokens.access_token, identity_token: tokens.identity_token, pin: "2468" },
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      data: { pin_set: true, other_sessions_signed_out: 1 },
    });

    // B's cookie is now invalid.
    const bSession = await callAppRoute(sessionsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/security/sessions`,
      cookie: b.cookie,
    });
    expect(bSession.status).toBe(401);

    // The lock is cleared and the new PIN works.
    await securityService.verifyPin(a.userId, "2468");
    const user = await db.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(user.pinFailedAttempts).toBe(0);
    expect(user.pinLockedUntil).toBeNull();

    // A's session now carries the new Privy session ID, so the same tokens
    // cannot reset the PIN again.
    const sessionA = await db.session.findFirstOrThrow({
      where: { userId: a.userId },
      orderBy: { createdAt: "desc" },
    });
    expect(sessionA.privySessionId).toBe(freshSid);
    await expect(
      securityService.resetPin(
        a.userId,
        { accessToken: tokens.access_token, identityToken: tokens.identity_token },
        "1357",
        sessionA.id,
      ),
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
  });

  it("refuses a reset without a fresh sign-in", async () => {
    const a = await signInCustomer("refuse@v3st.test");
    await securityService.setPin(a.userId, "1357", null);
    const sessionA = await db.session.findFirstOrThrow({
      where: { userId: a.userId },
      orderBy: { createdAt: "desc" },
    });

    // The customer's own session ID is not a fresh sign-in.
    const ownTokens = simulatedPrivy.mint("refuse@v3st.test", { sessionId: a.sessionId });
    await expect(
      securityService.resetPin(
        a.userId,
        { accessToken: ownTokens.access_token, identityToken: ownTokens.identity_token },
        "2468",
        sessionA.id,
      ),
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });

    // A new session ID issued too long ago is not fresh either.
    const oldTokens = simulatedPrivy.mint("refuse@v3st.test", {
      sessionId: randomUUID(),
      issuedAt: new Date(Date.now() - 301_000),
    });
    await expect(
      securityService.resetPin(
        a.userId,
        { accessToken: oldTokens.access_token, identityToken: oldTokens.identity_token },
        "2468",
        sessionA.id,
      ),
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });

    // Another customer's tokens do not count.
    await signInCustomer("other@v3st.test");
    const foreignTokens = simulatedPrivy.mint("other@v3st.test", { sessionId: randomUUID() });
    const foreignRes = await callAppRoute(pinResetPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/security/pin/reset`,
      cookie: a.cookie,
      body: {
        access_token: foreignTokens.access_token,
        identity_token: foreignTokens.identity_token,
        pin: "2468",
      },
    });
    expect(foreignRes.status).toBe(401);
    expect((foreignRes.json as { code: string }).code).toBe("SIGN_IN_AGAIN");

    // An operator test account has no Privy user.
    const operator = await makeUser();
    await expect(
      securityService.resetPin(
        operator.id,
        { accessToken: foreignTokens.access_token, identityToken: foreignTokens.identity_token },
        "2468",
        "nonexistent-session",
      ),
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
  });

  it("lists devices and refuses another customer's session", async () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
    const { cookie, userId, sessionId } = await signInCustomer("devices@v3st.test");
    const firstSessionRow = await db.session.findFirstOrThrow({
      where: { userId, privySessionId: sessionId },
    });
    const other = await signInCustomer("someone-else@v3st.test");
    const otherSessionRow = await db.session.findFirstOrThrow({
      where: { userId: other.userId, privySessionId: other.sessionId },
    });
    await callAppRoute(pinPUT, {
      method: "PUT",
      url: `${ORIGIN}/api/v1/app/security/pin`,
      cookie,
      body: { pin: "1357" },
    });
    // Re-sign-in with a recognisable device label.
    const signInRes = await callAppRoute(privySignInPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/auth/privy`,
      body: simulatedPrivy.mint("devices@v3st.test"),
      headers: { "user-agent": ua },
    });
    expect(signInRes.status).toBe(200);
    const deviceCookie = signInRes.headers.get("set-cookie")!.split(";")[0]!;

    const list = await callAppRoute(sessionsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/security/sessions`,
      cookie: deviceCookie,
    });
    expect(list.status).toBe(200);
    const sessions = (list.json as { data: { id: string; device: string; current: boolean }[] }).data;
    const current = sessions.find((s) => s.current);
    expect(current?.device).toBe("Chrome on Android");
    expect(sessions.some((s) => s.id === firstSessionRow.id && !s.current)).toBe(true);

    const foreign = await callAppRoute(sessionDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/security/sessions/${otherSessionRow.id}`,
      cookie: deviceCookie,
      params: { id: otherSessionRow.id },
    });
    expect(foreign.status).toBe(404);
    expect((foreign.json as { code: string }).code).toBe("NOT_FOUND");
    expect(userId).toBeTruthy();

    const signOutOthers = await callAppRoute(signOutOthersPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/security/sessions/sign-out-others`,
      cookie: deviceCookie,
    });
    expect(signOutOthers.status).toBe(200);
    expect((signOutOthers.json as { data: { signed_out: number } }).data.signed_out).toBe(1);
  });
});
