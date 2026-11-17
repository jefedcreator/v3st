import type { NextRequest } from "next/server";
import { expect } from "vitest";

import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { POST as betaPrivyTokensPOST } from "@/app/api/v1/app/beta/privy-tokens/route";
import { POST as privySignInPOST } from "@/app/api/v1/app/auth/privy/route";
import { POST as identityPOST } from "@/app/api/v1/app/identity/route";
import { POST as agreementsPOST } from "@/app/api/v1/app/agreements/route";
import { PUT as pinPUT } from "@/app/api/v1/app/security/pin/route";
import { PUT as bankAccountPUT } from "@/app/api/v1/app/bank-account/route";
import { CUSTOMER_DOCUMENTS, INVEST_DOCUMENTS } from "@/backend/content/documents";
import { db } from "@/server/db";

import { callRoute } from "./http";
import { drainJobs } from "./worker";

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export const ORIGIN = "http://localhost:3000";

// Calls a customer route and asserts the whole response body is free of
// internal vocabulary before returning it.
export async function callAppRoute(
  handler: RouteHandler,
  opts: Parameters<typeof callRoute>[1] & { documents?: boolean },
): ReturnType<typeof callRoute> {
  const res = await callRoute(handler, opts);
  const leaks = findCustomerLeaks(res.json, { documents: opts.documents });
  expect(leaks).toEqual([]);
  return res;
}

// Signs a customer in through the simulated Privy issuer and the real
// /app/auth/privy route, returning the session cookie and the database IDs.
export async function signInCustomer(
  email = "ada@v3st.test",
): Promise<{ cookie: string; userId: string; sessionId: string }> {
  const tokensRes = await callRoute(betaPrivyTokensPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/beta/privy-tokens`,
    body: { email },
  });
  expect(tokensRes.status).toBe(200);
  const tokens = (tokensRes.json as { data: { access_token: string; identity_token: string } }).data;
  const signInRes = await callAppRoute(privySignInPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/auth/privy`,
    body: tokens,
  });
  expect(signInRes.status).toBe(200);
  const setCookie = signInRes.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  const cookie = setCookie!.split(";")[0]!;
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const session = await db.session.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return { cookie, userId: user.id, sessionId: session.privySessionId! };
}

// Signs in and finishes onboarding: test identity, PIN, documents and a
// name-matched bank account, so money actions are ready.
export async function readyCustomer(
  email = "ada@v3st.test",
): Promise<{ cookie: string; userId: string; sessionId: string }> {
  const signed = await signInCustomer(email);
  const identityRes = await callAppRoute(identityPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/identity`,
    cookie: signed.cookie,
    body: { test_identity_id: "ada_tier2" },
  });
  expect(identityRes.status).toBe(200);
  // Run the background wallet provisioning so money actions are not delayed.
  await drainJobs();
  const pinRes = await callAppRoute(pinPUT, {
    method: "PUT",
    url: `${ORIGIN}/api/v1/app/security/pin`,
    cookie: signed.cookie,
    body: { pin: "1357" },
  });
  expect(pinRes.status).toBe(200);
  const agreementsRes = await callAppRoute(agreementsPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/agreements`,
    cookie: signed.cookie,
    body: {
      documents: INVEST_DOCUMENTS.map((slug) => ({
        slug,
        version: CUSTOMER_DOCUMENTS[slug].version,
      })),
    },
  });
  expect(agreementsRes.status).toBe(200);
  const bankRes = await callAppRoute(bankAccountPUT, {
    method: "PUT",
    url: `${ORIGIN}/api/v1/app/bank-account`,
    cookie: signed.cookie,
    body: { bank_code: "sim-bank-a", account_number: "0123456789", pin: "1357" },
  });
  expect(bankRes.status).toBe(200);
  return signed;
}
