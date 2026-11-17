import type { NextRequest } from "next/server";
import { expect } from "vitest";

import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { POST as betaPrivyTokensPOST } from "@/app/api/v1/app/beta/privy-tokens/route";
import { POST as privySignInPOST } from "@/app/api/v1/app/auth/privy/route";
import { db } from "@/server/db";

import { callRoute } from "./http";

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
