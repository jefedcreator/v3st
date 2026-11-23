import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { POST as betaPrivyTokensPOST } from "@/app/api/v1/app/beta/privy-tokens/route";
import { POST as privySignInPOST } from "@/app/api/v1/app/auth/privy/route";
import { POST as logoutPOST } from "@/app/api/v1/app/auth/logout/route";
import { GET as sessionGET } from "@/app/api/v1/app/session/route";
import { customerFor } from "@/backend/services/compliance";
import { YellowCardProvider } from "@/backend/services/ramp/yellowcard";
import type { Customer, Quote } from "@/backend/services/ramp/types";
import { db } from "@/server/db";

import { callAppRoute, ORIGIN, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { privyTestKeys, mintPrivyTokens } from "../helpers/privy";

useTestDatabase();

afterEach(() => {
  delete process.env.PRIVY_MODE;
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_VERIFICATION_KEY;
});

async function signInWithTokens(tokens: {
  access_token: string;
  identity_token: string;
}): Promise<{ status: number; json: unknown }> {
  const res = await callAppRoute(privySignInPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/auth/privy`,
    body: tokens,
  });
  return { status: res.status, json: res.json };
}

function sandboxTestTokens(i: {
  email: string | null;
  userId?: string;
  sessionId?: string;
  appId?: string;
  expiresInSeconds?: number;
  extraLinkedAccounts?: unknown[];
  key?: ReturnType<typeof privyTestKeys>;
}) {
  const keys = i.key ?? privyTestKeys();
  return mintPrivyTokens({
    privateKey: keys.privateKey,
    appId: i.appId ?? "test-app",
    userId: i.userId ?? `did:privy:test${randomUUID().slice(0, 8)}`,
    email: i.email,
    sessionId: i.sessionId ?? randomUUID(),
    expiresInSeconds: i.expiresInSeconds,
    extraLinkedAccounts: i.extraLinkedAccounts,
  });
}

function useSandboxMode(keys: ReturnType<typeof privyTestKeys>) {
  process.env.PRIVY_MODE = "sandbox";
  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_VERIFICATION_KEY = keys.publicKeyPem;
}

describe("customer sign-in with Privy email codes", () => {
  it("signs a new customer in from Privy tokens and reuses the account", async () => {
    const first = await signInCustomer("ada@example.com");
    const second = await signInCustomer("ada@example.com");
    expect(second.userId).toBe(first.userId);
    const user = await db.user.findUniqueOrThrow({ where: { id: first.userId } });
    expect(user.email).toBe("ada@example.com");
    expect(user.phone).toBeNull();
  });

  it("allows a regular email and Privy's test account in sandbox mode", async () => {
    const keys = privyTestKeys();
    useSandboxMode(keys);
    const allowed = await signInWithTokens(sandboxTestTokens({ email: "Ada+Beta@Example.com", key: keys }));
    expect(allowed.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email: "ada+beta@example.com" } });
    expect(user.identityMode).toBe("sandbox");

    const testAccount = await signInWithTokens(sandboxTestTokens({ email: "test-ab12@privy.io", key: keys }));
    expect(testAccount.status).toBe(200);
  });

  it("requires an email account linked to the verified Privy identity", async () => {
    const keys = privyTestKeys();
    useSandboxMode(keys);
    const res = await signInWithTokens(sandboxTestTokens({ email: null, key: keys }));
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ code: "NOT_ALLOWED", message: "Sign in with an email address." });
  });

  it("rejects forged, expired and mismatched tokens", async () => {
    const forged = await signInWithTokens(sandboxTestTokens({ email: "ada@v3st.test" }));
    expect(forged.status).toBe(401);
    expect((forged.json as { code: string }).code).toBe("SIGN_IN_REQUIRED");

    const wrongAudience = await signInWithTokens(
      sandboxTestTokens({ email: "ada@v3st.test", appId: "another-app" }),
    );
    expect(wrongAudience.status).toBe(401);
    expect((wrongAudience.json as { code: string }).code).toBe("SIGN_IN_REQUIRED");

    const expired = await signInWithTokens(
      sandboxTestTokens({ email: "ada@v3st.test", expiresInSeconds: -10 }),
    );
    expect(expired.status).toBe(401);
    expect((expired.json as { code: string }).code).toBe("SIGN_IN_AGAIN");

    const keys = privyTestKeys();
    const other = privyTestKeys();
    const access = mintPrivyTokens({
      privateKey: keys.privateKey,
      appId: "v3st-simulated",
      userId: "did:privy:sim-aaa",
      email: "ada@v3st.test",
      sessionId: randomUUID(),
    });
    const identity = mintPrivyTokens({
      privateKey: other.privateKey === keys.privateKey ? keys.privateKey : keys.privateKey,
      appId: "v3st-simulated",
      userId: "did:privy:sim-bbb",
      email: "ada@v3st.test",
      sessionId: randomUUID(),
    });
    const mismatched = await signInWithTokens({
      access_token: access.access_token,
      identity_token: identity.identity_token,
    });
    expect(mismatched.status).toBe(401);
    expect((mismatched.json as { code: string }).code).toBe("SIGN_IN_REQUIRED");
  });

  it("never stores a phone number from Privy", async () => {
    const keys = privyTestKeys();
    useSandboxMode(keys);
    const res = await signInWithTokens(
      sandboxTestTokens({
        email: "tunde@v3st.test",
        key: keys,
        extraLinkedAccounts: [{ type: "phone", phone_number: "+15555550000", lv: 1_700_000_000 }],
      }),
    );
    expect(res.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email: "tunde@v3st.test" } });
    expect(user.phone).toBeNull();
  });

  it("refuses simulated tokens outside simulated mode", async () => {
    const keys = privyTestKeys();
    useSandboxMode(keys);
    const res = await callAppRoute(betaPrivyTokensPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/beta/privy-tokens`,
      body: { email: "ada@v3st.test" },
    });
    expect(res.status).toBe(404);
    expect((res.json as { code: string }).code).toBe("NOT_FOUND");
  });

  it("refuses a cross-origin sign-in", async () => {
    const tokens = await mintedTokensFor("ada@v3st.test");
    const res = await callAppRoute(privySignInPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/auth/privy`,
      body: tokens,
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect((res.json as { code: string }).code).toBe("NOT_ALLOWED");
  });

  it("records the device and Privy session, reports the session and signs out", async () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
    const tokensRes = await callRoute(betaPrivyTokensPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/beta/privy-tokens`,
      body: { email: "ada@v3st.test" },
    });
    const tokens = (tokensRes.json as { data: { access_token: string; identity_token: string } }).data;
    const signInRes = await callAppRoute(privySignInPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/auth/privy`,
      body: tokens,
      headers: { "user-agent": ua },
    });
    expect(signInRes.status).toBe(200);
    const cookie = signInRes.headers.get("set-cookie")!.split(";")[0]!;
    const user = await db.user.findUniqueOrThrow({ where: { email: "ada@v3st.test" } });
    const session = await db.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(session.deviceLabel).toBe("Chrome on Android");
    expect(session.privySessionId).toBeTruthy();
    const accessPayload = JSON.parse(
      Buffer.from(tokens.access_token.split(".")[1]!, "base64url").toString("utf8"),
    ) as { sid: string };
    expect(session.privySessionId).toBe(accessPayload.sid);

    const sessionRes = await callAppRoute(sessionGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/session`,
      cookie,
    });
    expect(sessionRes.status).toBe(200);
    const sessionBody = sessionRes.json as {
      data: { signed_in: boolean; customer?: { email: string | null } };
    };
    expect(sessionBody.data.signed_in).toBe(true);
    expect(sessionBody.data.customer?.email).toBe("ada@v3st.test");

    const logoutRes = await callAppRoute(logoutPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/auth/logout`,
      cookie,
    });
    expect(logoutRes.status).toBe(200);
    const after = await callAppRoute(sessionGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/session`,
      cookie,
    });
    expect((after.json as { data: { signed_in: boolean } }).data.signed_in).toBe(false);
  });

  it("sends ramp customer data without a phone", async () => {
    const { cookie, userId } = await signInCustomer("nophone@v3st.test");
    expect(cookie).toBeTruthy();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const customer = customerFor(user);
    expect(customer.phone).toBeNull();

    const fixtureDir = path.resolve(import.meta.dirname, "../contracts/fixtures/yellowcard");
    const receiveFixture = JSON.parse(
      readFileSync(path.join(fixtureDir, "receive-submit-201.json"), "utf8"),
    ) as unknown;
    const calls: Request[] = [];
    const recordingFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const req = new Request(input);
      calls.push(req);
      return new Response(JSON.stringify(receiveFixture), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const provider = new YellowCardProvider({
      apiKey: "test-key",
      secret: "test-secret",
      fetch: recordingFetch,
    });
    const quote: Quote = {
      provider: "yellowcard",
      direction: "in",
      ngnAmount: 100_000n,
      feeNgn: 0n,
      usdAmount: 62_500n,
      rate: { kobo: 1_600_000n, microUsd: 1_000_000n },
      expiresAt: new Date(Date.now() + 60_000),
      channelRef: null,
    };
    const phoneLessCustomer: Customer = { ...customer };
    await provider.createCollection({
      quote,
      customer: phoneLessCustomer,
      source: { bankCode: "sim-bank-a", accountNumber: "0123456789", accountName: "Adaeze Obi" },
      key: `dep-test-${randomUUID()}`,
      recipient: null,
    });
    const body = JSON.parse(await calls[0]!.text()) as { recipient: Record<string, unknown> };
    expect("phone" in body.recipient).toBe(false);
  });
});

async function mintedTokensFor(email: string): Promise<{ access_token: string; identity_token: string }> {
  const res = await callRoute(betaPrivyTokensPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/beta/privy-tokens`,
    body: { email },
  });
  expect(res.status).toBe(200);
  return (res.json as { data: { access_token: string; identity_token: string } }).data;
}
