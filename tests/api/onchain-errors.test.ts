import { randomBytes, randomUUID } from "node:crypto";

import { encodeFunctionData, keccak256, toHex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as investmentQuotePOST } from "@/app/api/v1/investments/quote/route";
import { POST as investmentsPOST } from "@/app/api/v1/investments/route";
import { GET as investmentGET } from "@/app/api/v1/investments/[id]/route";
import { POST as authorizationsPOST } from "@/app/api/v1/investment-authorizations/route";
import { DELETE as authorizationDELETE } from "@/app/api/v1/investment-authorizations/[id]/route";
import { POST as strategyQuotesPOST } from "@/app/api/v1/strategy-quotes/route";
import { POST as strategyOperationsPOST } from "@/app/api/v1/strategy-operations/route";
import { POST as onchainScenariosPOST } from "@/app/api/v1/beta/onchain-scenarios/route";
import { POST as receiptConvertPOST } from "@/app/api/v1/reward-receipts/[id]/convert/route";
import { GET as integrationsGET } from "@/app/api/v1/ops/integrations/route";
import { now } from "@/backend/clock";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { stockDistributionAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { kycService } from "@/backend/services/kyc";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import type { InvestmentDto, InvestmentQuoteDto } from "@/backend/services/investments";
import { toDbRaw } from "@/utils/asset-units";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import { fundCash, makeUser, makeUserWithWallets } from "../helpers/factories";
import { authHeaders } from "../helpers/journey";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

const ORIGIN = "http://localhost:3000";

async function sessionFor(userId: string): Promise<string> {
  const sessionToken = randomBytes(32).toString("base64url");
  await db.session.create({
    data: { sessionToken, userId, expires: new Date(now().getTime() + 86_400_000) },
  });
  return sessionToken;
}

function cookieOnly(token: string): Record<string, string> {
  return { cookie: `sara-session=${token}` };
}

async function setup(symbol: string) {
  const handle = await testnet();
  await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  await kycService.verify(u.id, { persona: "ada_tier2" });
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token } = await makeTestnetStock({ symbol, referencePriceMicroUsd: 2_000_000n });
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  await handle.mintSettlement(ref.accountAddress, 100_000_000n);
  await fundCash(u.id, 10_000_000n, "testnet");
  const session = await sessionFor(u.id);
  return { handle, u, ref, stock, token, session };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function makeAuthorization(ctx: Ctx): Promise<string> {
  const res = await callRoute(authorizationsPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/investment-authorizations`,
    body: JSON.stringify({
      scope: "investments",
      stock_id: ctx.stock.id,
      max_spend_usdc: "9000000000000000000",
      duration_days: 7,
      policy_version: "api-errors",
    }),
    headers: authHeaders(ctx.session, randomUUID()),
  });
  expect(res.status).toBe(201);
  return (res.json as { data: { id: string } }).data.id;
}

async function quoteBuy(ctx: Ctx, body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  return callRoute(investmentQuotePOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/investments/quote`,
    body: JSON.stringify({ stock_id: ctx.stock.id, ...body }),
    headers: authHeaders(ctx.session),
  });
}

// A real stonks distribution epoch on the local replica so claim quotes can read
// generation/reward-token/entitlement onchain.
async function makeStonksStrategy(ctx: Ctx, tag: string) {
  const epochKey = keccak256(toHex(`stonks:${tag}`));
  await ctx.handle.sendTx({
    to: ctx.handle.stockDistribution,
    data: encodeFunctionData({
      abi: stockDistributionAbi,
      functionName: "createEpoch",
      args: [epochKey, ctx.token, 1],
    }),
  });
  return db.strategy.create({
    data: {
      providerId: "stonks",
      key: `stonks-${tag}-${randomUUID()}`,
      name: "stonks distribution",
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [],
      receiptAsset: "none",
      rewardAssets: [],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: {
        source: "stonks",
        distribution: ctx.handle.stockDistribution,
        launchId: epochKey,
        generation: 1,
      },
    },
  });
}

beforeEach(async () => {
  setNow("2026-11-12T20:00:00Z");
});

describe("onchain API error contract", () => {
  it("requires authentication, a safe origin, an idempotency key and a strict body", async () => {
    const ctx = await setup("ERR1");

    const noAuth = await callRoute(investmentQuotePOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments/quote`,
      body: JSON.stringify({ stock_id: ctx.stock.id, side: "buy", input_raw: "1000000" }),
      headers: { origin: ORIGIN },
    });
    expect(noAuth.status).toBe(401);

    const badOrigin = await callRoute(investmentQuotePOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments/quote`,
      body: JSON.stringify({ stock_id: ctx.stock.id, side: "buy", input_raw: "1000000" }),
      headers: { cookie: `sara-session=${ctx.session}`, origin: "https://evil.example" },
    });
    expect(badOrigin.status).toBe(403);
    expect((badOrigin.json as { code: string }).code).toBe("CROSS_ORIGIN");

    const noKey = await callRoute(investmentsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments`,
      body: JSON.stringify({ quote_id: "ck0000000000000000000000ab", authorization_id: "ck0000000000000000000000cd" }),
      headers: authHeaders(ctx.session),
    });
    expect(noKey.status).toBe(400);
    expect((noKey.json as { code: string }).code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    // Strict bodies: unknown keys, sell without input_raw, buy without a size.
    const unknownKey = await quoteBuy(ctx, { side: "buy", input_raw: "1000000", provider_id: "hydrex" });
    expect(unknownKey.status).toBe(422);
    expect((unknownKey.json as { code: string }).code).toBe("VALIDATION_FAILED");
    const sellNoSize = await quoteBuy(ctx, { side: "sell" });
    expect(sellNoSize.status).toBe(422);
    const buyNoSize = await quoteBuy(ctx, { side: "buy" });
    expect(buyNoSize.status).toBe(422);
    // Clients never choose the provider/chain/recipient; the field is rejected above.
  });

  it("rejects cross-user reads and writes with 404", async () => {
    const ctx = await setup("ERR2");
    const authId = await makeAuthorization(ctx);
    const q = await quoteBuy(ctx, { side: "buy", input_raw: "1000000" });
    expect(q.status).toBe(200);
    const quote = (q.json as { data: InvestmentQuoteDto }).data;
    const confirm = await callRoute(investmentsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments`,
      body: JSON.stringify({ quote_id: quote.id, authorization_id: authId }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(confirm.status).toBe(202);
    const inv = (confirm.json as { data: InvestmentDto }).data;

    const other = await makeUserWithWallets();
    const otherSession = await sessionFor(other.id);
    const read = await callRoute(investmentGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/investments/${inv.id}`,
      headers: cookieOnly(otherSession),
      params: { id: inv.id },
    });
    expect(read.status).toBe(404);
    // The other user cannot spend our authorization either.
    const foreignConfirm = await callRoute(investmentsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments`,
      body: JSON.stringify({ quote_id: quote.id, authorization_id: authId }),
      headers: authHeaders(otherSession, randomUUID()),
    });
    expect(foreignConfirm.status).toBe(404);
    const revoke = await callRoute(authorizationDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/investment-authorizations/${authId}`,
      headers: authHeaders(otherSession),
      params: { id: authId },
    });
    expect(revoke.status).toBe(404);
    const convert = await callRoute(receiptConvertPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/reward-receipts/ck0000000000000000000000ef/convert`,
      body: JSON.stringify({ authorization_id: authId }),
      headers: authHeaders(otherSession, randomUUID()),
      params: { id: "ck0000000000000000000000ef" },
    });
    expect(convert.status).toBe(404);
  });

  it("returns 409 for expired strategy quotes and keeps cash for expired investment quotes", async () => {
    const ctx = await setup("ERR3");
    const authId = await makeAuthorization(ctx);

    // Expired investment quote: 202 with a friendly hold reason, cash untouched.
    const cashBefore = await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"));
    const q = await quoteBuy(ctx, { side: "buy", input_raw: "5000000" });
    expect(q.status).toBe(200);
    const quote = (q.json as { data: InvestmentQuoteDto }).data;
    await db.investmentQuote.update({
      where: { id: quote.id },
      data: { expiresAt: new Date(now().getTime() - 1_000) },
    });
    const confirm = await callRoute(investmentsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments`,
      body: JSON.stringify({ quote_id: quote.id, authorization_id: authId }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(confirm.status).toBe(202);
    const inv = (confirm.json as { data: InvestmentDto }).data;
    expect(inv.status).toBe("needs_confirmation");
    expect(inv.operation_id).toBeNull();
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(cashBefore);

    // Inadequate balance: 409 INSUFFICIENT_FUNDS, nothing reserved.
    const big = await quoteBuy(ctx, { side: "buy", input_raw: "50000000" });
    expect(big.status).toBe(200);
    const bigQuote = (big.json as { data: InvestmentQuoteDto }).data;
    const bigConfirm = await callRoute(investmentsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments`,
      body: JSON.stringify({ quote_id: bigQuote.id, authorization_id: authId }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(bigConfirm.status).toBe(409);
    expect(["INSUFFICIENT_FUNDS", "AUTHORIZATION_EXCEEDED"]).toContain(
      (bigConfirm.json as { code: string }).code,
    );

    // Expired strategy quote: 409 QUOTE_EXPIRED on confirm.
    const strategy = await makeStonksStrategy(ctx, "err3");
    const stratAuthRes = await callRoute(authorizationsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investment-authorizations`,
      body: JSON.stringify({
        scope: "strategies",
        strategy_id: strategy.id,
        max_spend_usdc: "1000000000000",
        duration_days: 7,
        policy_version: "api-errors",
      }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(stratAuthRes.status).toBe(201);
    const stratAuthId = (stratAuthRes.json as { data: { id: string } }).data.id;
    const sq = await callRoute(strategyQuotesPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/strategy-quotes`,
      body: JSON.stringify({ strategy_id: strategy.id, action: "claim" }),
      headers: authHeaders(ctx.session),
    });
    expect(sq.status).toBe(200);
    const sqId = (sq.json as { data: { id: string } }).data.id;
    await db.strategyQuote.update({
      where: { id: sqId },
      data: { expiresAt: new Date(now().getTime() - 1_000) },
    });
    const sConfirm = await callRoute(strategyOperationsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/strategy-operations`,
      body: JSON.stringify({ quote_id: sqId, authorization_id: stratAuthId }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(sConfirm.status).toBe(409);
    expect((sConfirm.json as { code: string }).code).toBe("QUOTE_EXPIRED");
  });

  it("scopes beta scenarios to the owner and the operation state", async () => {
    const ctx = await setup("ERR4");
    const authId = await makeAuthorization(ctx);
    const q = await quoteBuy(ctx, { side: "buy", input_raw: "1000000" });
    const quote = (q.json as { data: InvestmentQuoteDto }).data;
    const confirm = await callRoute(investmentsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investments`,
      body: JSON.stringify({ quote_id: quote.id, authorization_id: authId }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(confirm.status).toBe(202);
    const inv = (confirm.json as { data: InvestmentDto }).data;

    const postScenario = (session: string, operationId: string, scenario: string) =>
      callRoute(onchainScenariosPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/beta/onchain-scenarios`,
        body: JSON.stringify({ operation_id: operationId, scenario }),
        headers: authHeaders(session, randomUUID()),
      });

    // Unknown scenario kind and unknown operation are rejected.
    const badKind = await postScenario(ctx.session, inv.operation_id!, "mint_to_recipient");
    expect(badKind.status).toBe(422);
    const unknownOp = await postScenario(ctx.session, "ck0000000000000000000000ab", "revert");
    expect(unknownOp.status).toBe(404);

    // partial_fill fits o1 spot operations only: create a strategy-kind op and
    // confirm the scenario is refused for it.
    const strategy = await makeStonksStrategy(ctx, "err4");
    const stratAuthRes = await callRoute(authorizationsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/investment-authorizations`,
      body: JSON.stringify({
        scope: "strategies",
        strategy_id: strategy.id,
        max_spend_usdc: "1000000000000",
        duration_days: 7,
        policy_version: "api-errors",
      }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    const stratAuthId = (stratAuthRes.json as { data: { id: string } }).data.id;
    const sq = await callRoute(strategyQuotesPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/strategy-quotes`,
      body: JSON.stringify({ strategy_id: strategy.id, action: "claim" }),
      headers: authHeaders(ctx.session),
    });
    const stratOp = await callRoute(strategyOperationsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/strategy-operations`,
      body: JSON.stringify({ quote_id: (sq.json as { data: { id: string } }).data.id, authorization_id: stratAuthId }),
      headers: authHeaders(ctx.session, randomUUID()),
    });
    expect(stratOp.status).toBe(202);
    const stratOpId = (stratOp.json as { data: { operation_id: string } }).data.operation_id;
    const wrongKind = await postScenario(ctx.session, stratOpId, "partial_fill");
    expect(wrongKind.status).toBe(409);
    expect((wrongKind.json as { code: string }).code).toBe("INVALID_SCENARIO_STATE");

    // Drive the buy to finality, then a scenario on the finalized operation is a 409.
    for (let i = 0; i < 15; i += 1) {
      await drainJobs();
      await ctx.handle.mine(3);
      const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
      if (["finalized", "reverted", "failed"].includes(op.status)) break;
    }
    const finalOp = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
    expect(finalOp.status).toBe("finalized");
    const onFinal = await postScenario(ctx.session, inv.operation_id!, "zero_rewards");
    expect(onFinal.status).toBe(409);
    expect((onFinal.json as { code: string }).code).toBe("INVALID_SCENARIO_STATE");

    // A different user cannot trigger scenarios on our operation.
    const other = await makeUserWithWallets();
    const otherSession = await sessionFor(other.id);
    const cross = await postScenario(otherSession, inv.operation_id!, "zero_rewards");
    expect(cross.status).toBe(404);
  });

  it("keeps operator evidence behind the operator role", async () => {
    const ctx = await setup("ERR5");
    const opsRes = await callRoute(integrationsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/ops/integrations`,
      headers: cookieOnly(ctx.session),
    });
    expect(opsRes.status).toBe(403);

    const operator = await makeUser({ role: "operator" });
    const operatorSession = await sessionFor(operator.id);
    const okRes = await callRoute(integrationsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/ops/integrations`,
      headers: cookieOnly(operatorSession),
    });
    expect(okRes.status).toBe(200);
    const providers = (okRes.json as { data: { provider_id: string; actual_integration: string }[] }).data;
    expect(providers.length).toBe(6);
    expect(providers.every((p) => p.actual_integration === "disabled_unverified")).toBe(true);
  });
});
