import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { db } from "@/server/db";
import { POST as identityTokenPOST } from "@/app/api/v1/beta/identity-token/route";
import { POST as sessionPOST } from "@/app/api/v1/auth/session/route";
import { POST as verificationPOST } from "@/app/api/v1/identity/verification/route";
import { POST as bankAccountsPOST } from "@/app/api/v1/bank-accounts/route";
import { POST as depositsPOST } from "@/app/api/v1/deposits/route";
import { GET as depositGET } from "@/app/api/v1/deposits/[id]/route";
import { POST as scenariosPOST } from "@/app/api/v1/beta/scenarios/route";
import { GET as portfolioGET } from "@/app/api/v1/portfolio/route";
import { POST as quotePOST } from "@/app/api/v1/withdrawals/quote/route";
import { POST as withdrawalsPOST } from "@/app/api/v1/withdrawals/route";
import { GET as withdrawalGET } from "@/app/api/v1/withdrawals/[id]/route";
import { GET as earningsGET } from "@/app/api/v1/earnings/route";
import { PUT as preferencePUT } from "@/app/api/v1/earnings/preference/route";
import type { EarningsWeekDto, PortfolioDto } from "@/types/dto";

import { callRoute } from "./http";

export const JOURNEY_ORIGIN = "http://localhost:3000";
export const JOURNEY_PHONE = "+2340000000042";

export type JourneyContext = {
  token: string;
  userId: string;
  stockId: string;
  depositId: string;
  quoteId: string;
  withdrawalId: string;
};

export function authHeaders(token: string, key?: string): Record<string, string> {
  return {
    cookie: `sara-session=${token}`,
    origin: JOURNEY_ORIGIN,
    ...(key ? { "idempotency-key": key } : {}),
  };
}

export async function stepIdentityToken(phone: string): Promise<string> {
  const res = await callRoute(identityTokenPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/beta/identity-token`,
    body: JSON.stringify({ phone }),
  });
  expect(res.status).toBe(200);
  return (res.json as { data: { identity_token: string } }).data.identity_token;
}

export async function stepSession(
  identityToken: string,
): Promise<{ token: string; userId: string }> {
  const res = await callRoute(sessionPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/auth/session`,
    body: JSON.stringify({ identity_token: identityToken }),
    headers: { origin: JOURNEY_ORIGIN },
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie") ?? "";
  const token = /sara-session=([^;]+)/.exec(cookie)?.[1];
  expect(token).toBeTruthy();
  const session = await db.session.findFirstOrThrow({
    where: { sessionToken: token! },
  });
  return { token: token!, userId: session.userId };
}

export async function stepVerification(token: string): Promise<void> {
  const res = await callRoute(verificationPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/identity/verification`,
    body: JSON.stringify({ persona: "ada_tier2" }),
    headers: authHeaders(token),
  });
  expect(res.status).toBe(200);
  expect((res.json as { data: { status: string } }).data.status).toBe("verified");
}

export async function stepBankAccount(token: string): Promise<void> {
  const res = await callRoute(bankAccountsPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/bank-accounts`,
    body: JSON.stringify({ bank_code: "sim-bank-a", account_number: "0123456789" }),
    headers: authHeaders(token),
  });
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({
    data: { account_number_masked: "******6789", resolved_name: "ADAEZE OBI" },
  });
}

export async function stepDeposit(
  token: string,
  stockId: string,
  ngnAmount = "2000000",
): Promise<string> {
  const res = await callRoute(depositsPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/deposits`,
    body: JSON.stringify({ ngn_amount: ngnAmount, stock_id: stockId }),
    headers: authHeaders(token, randomUUID()),
  });
  expect([200, 201, 202]).toContain(res.status);
  return (res.json as { data: { id: string } }).data.id;
}

export async function stepScenario(
  token: string,
  orderId: string,
  scenario: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const res = await callRoute(scenariosPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/beta/scenarios`,
    body: JSON.stringify({ order_id: orderId, scenario, ...extra }),
    headers: authHeaders(token),
  });
  expect(res.status).toBe(200);
}

export async function stepDepositStatus(
  token: string,
  id: string,
): Promise<{ status: string; trade?: { status: string } }> {
  const res = await callRoute(depositGET, {
    method: "GET",
    url: `${JOURNEY_ORIGIN}/api/v1/deposits/${id}`,
    headers: { cookie: `sara-session=${token}` },
    params: { id },
  });
  expect(res.status).toBe(200);
  return (res.json as { data: { status: string; trade?: { status: string } } }).data;
}

export async function stepPortfolio(token: string): Promise<PortfolioDto> {
  const res = await callRoute(portfolioGET, {
    method: "GET",
    url: `${JOURNEY_ORIGIN}/api/v1/portfolio`,
    headers: { cookie: `sara-session=${token}` },
  });
  expect(res.status).toBe(200);
  return (res.json as { data: PortfolioDto }).data;
}

export async function stepQuote(
  token: string,
  ngnAmount: string,
  stockId?: string,
): Promise<string> {
  const res = await callRoute(quotePOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/withdrawals/quote`,
    body: JSON.stringify({ ngn_amount: ngnAmount, ...(stockId ? { stock_id: stockId } : {}) }),
    headers: authHeaders(token),
  });
  expect(res.status).toBe(200);
  return (res.json as { data: { id: string } }).data.id;
}

export async function stepWithdrawal(token: string, quoteId: string): Promise<string> {
  const res = await callRoute(withdrawalsPOST, {
    method: "POST",
    url: `${JOURNEY_ORIGIN}/api/v1/withdrawals`,
    body: JSON.stringify({ quote_id: quoteId }),
    headers: authHeaders(token, randomUUID()),
  });
  expect([200, 201]).toContain(res.status);
  return (res.json as { data: { id: string } }).data.id;
}

export async function stepWithdrawalStatus(
  token: string,
  id: string,
): Promise<{ status: string; bank_reference: string | null }> {
  const res = await callRoute(withdrawalGET, {
    method: "GET",
    url: `${JOURNEY_ORIGIN}/api/v1/withdrawals/${id}`,
    headers: { cookie: `sara-session=${token}` },
    params: { id },
  });
  expect(res.status).toBe(200);
  return (res.json as { data: { status: string; bank_reference: string | null } }).data;
}

export async function stepEarnings(token: string): Promise<EarningsWeekDto[]> {
  const res = await callRoute(earningsGET, {
    method: "GET",
    url: `${JOURNEY_ORIGIN}/api/v1/earnings?page=1&size=20`,
    headers: { cookie: `sara-session=${token}` },
  });
  expect(res.status).toBe(200);
  return (res.json as { data: EarningsWeekDto[] }).data;
}

export async function stepPreference(token: string, mode = "payout"): Promise<void> {
  const res = await callRoute(preferencePUT, {
    method: "PUT",
    url: `${JOURNEY_ORIGIN}/api/v1/earnings/preference`,
    body: JSON.stringify({ mode }),
    headers: authHeaders(token),
  });
  expect(res.status).toBe(200);
}
