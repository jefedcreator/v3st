import { randomBytes, randomUUID } from "node:crypto";

import { type Address, type Hex, encodeFunctionData, keccak256, toHex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as stocksGET } from "@/app/api/v1/stocks/route";
import { GET as stockGET } from "@/app/api/v1/stocks/[id]/route";
import { POST as investmentQuotePOST } from "@/app/api/v1/investments/quote/route";
import { GET as investmentsGET, POST as investmentsPOST } from "@/app/api/v1/investments/route";
import { GET as investmentGET } from "@/app/api/v1/investments/[id]/route";
import {
  GET as authorizationsGET,
  POST as authorizationsPOST,
} from "@/app/api/v1/investment-authorizations/route";
import { DELETE as authorizationDELETE } from "@/app/api/v1/investment-authorizations/[id]/route";
import { GET as strategiesGET } from "@/app/api/v1/strategies/route";
import { GET as strategyGET } from "@/app/api/v1/strategies/[id]/route";
import { POST as strategyQuotesPOST } from "@/app/api/v1/strategy-quotes/route";
import { POST as strategyOperationsPOST } from "@/app/api/v1/strategy-operations/route";
import { GET as strategyOperationGET } from "@/app/api/v1/strategy-operations/[id]/route";
import { GET as strategyPositionsGET } from "@/app/api/v1/strategy-positions/route";
import { POST as onchainScenariosPOST } from "@/app/api/v1/beta/onchain-scenarios/route";
import { POST as receiptConvertPOST } from "@/app/api/v1/reward-receipts/[id]/convert/route";
import { PUT as preferencePUT } from "@/app/api/v1/earnings/preference/route";
import { GET as integrationsGET } from "@/app/api/v1/ops/integrations/route";
import { GET as onchainOpsGET } from "@/app/api/v1/ops/onchain-operations/route";
import { POST as depositsPOST } from "@/app/api/v1/deposits/route";
import { now } from "@/backend/clock";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { hydrexPoolAbi, settlementTokenAbi, stockDistributionAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { publicClientFor, settlementAssetKey } from "@/backend/services/onchain/testnet";
import type { InvestmentDto, InvestmentQuoteDto } from "@/backend/services/investments";
import type { StrategyDto, StrategyOperationDto, StrategyPositionDto } from "@/backend/services/strategies";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import type { IntegrationEvidenceDto, OnchainOpsDto } from "@/types/contract";
import type { StockDto } from "@/types/dto";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import { makeUser, makeVerifiedUser, seedFloat, seedTreasury } from "../helpers/factories";
import {
  JOURNEY_PHONE,
  authHeaders,
  stepBankAccount,
  stepDepositStatus,
  stepEarnings,
  stepIdentityToken,
  stepPortfolio,
  stepScenario,
  stepSession,
  stepVerification,
} from "../helpers/journey";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

const ORIGIN = "http://localhost:3000";
const SEED_SETTLEMENT = 1_000_000_000_000n;
const SEED_STOCK = 500_000n * 10n ** 18n;
const ENTITLEMENT = 1n * 10n ** 18n; // one share at $2/share pays above the Friday minimum

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

const NO_SIGNING_MATERIAL = /signed_?payload|approve_?tx|execute_?tx|serialized_?transaction|unsigned_?tx|private_?key/i;

let payoutAt: Date;
beforeEach(async () => {
  // Keep both clocks in the same week. A fixed historical app date against a
  // real-time Anvil node cannot produce a valid short-lived FX/contract deadline.
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  const chainAt = new Date(Number(block.timestamp) * 1000);
  const thursday = new Date(chainAt);
  thursday.setUTCDate(thursday.getUTCDate() + (4 - thursday.getUTCDay() + 7) % 7);
  thursday.setUTCHours(20, 0, 0, 0); // Thursday 21:00 Lagos
  if (thursday <= chainAt) thursday.setUTCDate(thursday.getUTCDate() + 7);
  await (await testnet()).advanceTime(Math.ceil((thursday.getTime() - chainAt.getTime()) / 1000));
  setNow(thursday.toISOString());
  payoutAt = new Date(thursday.getTime() + 11 * 60 * 60 * 1000);
  await seedTreasury("base", 1_000_000_000_000n);
  await seedTreasury("testnet", 1_000_000_000_000n);
  await seedFloat("yellowcard", 10_000_000_000n);
});

describe("onchain beta HTTP journey", () => {
  it(
    "walks login to Friday payout over the wrapped APIs on the local testnet",
    { timeout: 300_000 },
    async () => {
      const handle = await testnet();
      await ensureTestnetNetwork();
      const { stock, token } = await makeTestnetStock({
        symbol: "JRN",
        referencePriceMicroUsd: 2_000_000n,
        supply: 10_000_000n * 10n ** 18n,
      });
      await handle.seedO1Pool(token, SEED_SETTLEMENT, SEED_STOCK);
      // A second stock with only an O1 pool: used for the failed-buy scenario,
      // which fits o1 spot operations only.
      const { stock: failStock, token: failToken } = await makeTestnetStock({
        symbol: "JRN2",
        referencePriceMicroUsd: 2_000_000n,
      });
      await handle.seedO1Pool(failToken, SEED_SETTLEMENT, SEED_STOCK);

      // Hydrex LP fixture for strategy entry.
      const pool = await handle.deployHydrexPool(token);
      await db.stock.update({
        where: { id: stock.id },
        data: { provenance: { ...(stock.provenance as object), hydrexPool: pool } },
      });
      const settlementKey = settlementAssetKey(handle.manifest);
      await handle.mintSettlement(handle.account.address, SEED_SETTLEMENT);
      await handle.sendTx({
        to: token,
        data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [handle.account.address, SEED_STOCK] }),
      });
      await handle.sendTx({
        to: token,
        data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [pool, SEED_STOCK] }),
      });
      await handle.sendTx({
        to: handle.settlement,
        data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [pool, SEED_SETTLEMENT] }),
      });
      await handle.sendTx({
        to: pool,
        data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "seed", args: [SEED_SETTLEMENT, SEED_STOCK] }),
      });

      // Stonks distribution epoch; the entitlement is bound to the user's
      // execution account once the session exists below.
      const epochKey = keccak256(toHex("stonks:api-journey"));
      await handle.sendTx({
        to: handle.stockDistribution,
        data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "createEpoch", args: [epochKey, token, 1] }),
      });

      // drainJobs fast-forwards the mocked clock; keep the reference price fresh so
      // quotes remain usable after each worker round.
      const touchReference = async (): Promise<void> => {
        await db.stock.updateMany({
          where: { id: { in: [stock.id, failStock.id] } },
          data: { referenceAsOf: now(), referencePriceMicroUsd: 2_000_000n },
        });
      };

      const lpStrategy = await db.strategy.create({
        data: {
          providerId: "hydrex",
          key: `hydrex-lp-journey-${randomUUID()}`,
          name: "JRN LP replica",
          version: "replica-1.0.0",
          disclosureVersion: "1",
          inputAssets: [settlementKey, stock.assetKey!],
          receiptAsset: `lp:31337:${pool.toLowerCase()}`,
          rewardAssets: [stock.assetKey!],
          separateClaim: true,
          permanentLock: false,
          capBps: 2000,
          maxUsdEquivalent: toDbRaw(100_000_000n),
          provenance: { pool, stockId: stock.id },
        },
      });
      const stonksStrategy = await db.strategy.create({
        data: {
          providerId: "stonks",
          key: `stonks-journey-${randomUUID()}`,
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
            distribution: handle.stockDistribution,
            launchId: epochKey,
            generation: 1,
          },
        },
      });

      // 1. Synthetic login/verification and a test bank account.
      const identityToken = await stepIdentityToken(JOURNEY_PHONE);
      const { token: session, userId } = await stepSession(identityToken);
      await drainJobs();
      await stepVerification(session);
      await stepBankAccount(session);
      const ref = await testnetWalletService.ensureExecutionAccount(userId);
      await handle.sendTx({
        to: handle.stockDistribution,
        data: encodeFunctionData({
          abi: stockDistributionAbi,
          functionName: "setEntitlement",
          args: [epochKey, ref.accountAddress, ENTITLEMENT],
        }),
      });
      await handle.sendTx({
        to: token,
        data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [handle.account.address, ENTITLEMENT] }),
      });
      await handle.sendTx({
        to: token,
        data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [handle.stockDistribution, ENTITLEMENT] }),
      });
      await handle.sendTx({
        to: handle.stockDistribution,
        data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "fundEpoch", args: [epochKey, ENTITLEMENT] }),
      });
      // Local testnet fixture funding: ledger cash plus onchain settlement held by
      // the user's execution account (the relayer pays all gas).
      // Customer funds are supplied only by the bank-receipt funding workflow.

      // 2. Test bank receipt over HTTP: fiat deposit paid through the simulated ramp.
      const depRes = await callRoute(depositsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/deposits`,
        body: JSON.stringify({ ngn_amount: "10000000" }),
        headers: authHeaders(session, randomUUID()),
      });
      expect([200, 201, 202]).toContain(depRes.status);
      const depositId = (depRes.json as { data: { id: string } }).data.id;
      await stepScenario(session, depositId, "deposit_paid");
      await drainJobs();
      expect((await stepDepositStatus(session, depositId)).status).toBe("settled");

      // 3. Stock catalog and detail over HTTP.
      const stocksRes = await callRoute(stocksGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/stocks`,
        headers: cookieOnly(session),
      });
      expect(stocksRes.status).toBe(200);
      const jrn = (stocksRes.json as { data: StockDto[] }).data.find((s) => s.symbol === "JRN")!;
      expect(jrn.tradable).toBe(true);
      expect(jrn.asset_key).toBe(stock.assetKey);
      const detailRes = await callRoute(stockGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/stocks/${stock.id}`,
        headers: cookieOnly(session),
        params: { id: stock.id },
      });
      expect(detailRes.status).toBe(200);
      expect((detailRes.json as { data: StockDto }).data.id).toBe(stock.id);
      const missingStock = await callRoute(stockGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/stocks/ck0000000000000000000000ab`,
        headers: cookieOnly(session),
        params: { id: "ck0000000000000000000000ab" },
      });
      expect(missingStock.status).toBe(404);

      // 4. Investment quote first, then a one-time authorization bound to that
      // persisted quote; replay returns the same resource, a reused key with a
      // different body conflicts, list is owner-scoped.
      await touchReference();
      const quoteRes = await callRoute(investmentQuotePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investments/quote`,
        body: JSON.stringify({ stock_id: stock.id, side: "buy", budget_ngn: "300000" }),
        headers: authHeaders(session),
      });
      expect(quoteRes.status).toBe(200);
      const quote = (quoteRes.json as { data: InvestmentQuoteDto }).data;
      expect(["o1", "hydrex", "bankr"]).toContain(quote.provider_id);
      expect(BigInt(quote.expected_output_raw)).toBeGreaterThan(0n);
      expect(BigInt(quote.min_output_raw)).toBeGreaterThan(0n);
      expect(JSON.stringify(quoteRes.json)).not.toMatch(NO_SIGNING_MATERIAL);

      const authKey = randomUUID();
      const authBody = {
        kind: "one_time",
        quote_kind: "investment",
        quote_id: quote.id,
        policy_version: "api-1",
        disclosure_version: "1",
      };
      const authRes = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify(authBody),
        headers: authHeaders(session, authKey),
      });
      expect(authRes.status).toBe(201);
      const authId = (authRes.json as { data: { id: string } }).data.id;
      const authReplay = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify(authBody),
        headers: authHeaders(session, authKey),
      });
      expect(authReplay.status).toBe(200);
      expect((authReplay.json as { data: { id: string } }).data.id).toBe(authId);
      const authConflict = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify({ ...authBody, disclosure_version: "2" }),
        headers: authHeaders(session, authKey),
      });
      expect(authConflict.status).toBe(409);
      expect((authConflict.json as { code: string }).code).toBe("IDEMPOTENCY_KEY_REUSED");
      const authList = await callRoute(authorizationsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        headers: cookieOnly(session),
      });
      expect(authList.status).toBe(200);
      expect(
        (authList.json as { data: { id: string }[] }).data.some((a) => a.id === authId),
      ).toBe(true);

      const buyKey = randomUUID();
      const confirmBody = JSON.stringify({ quote_id: quote.id, authorization_id: authId });
      const confirmRes = await callRoute(investmentsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investments`,
        body: confirmBody,
        headers: authHeaders(session, buyKey),
      });
      expect(confirmRes.status).toBe(202);
      const investment = (confirmRes.json as { data: InvestmentDto }).data;
      expect(investment.status).toBe("executing");
      expect(investment.operation_id).toBeTruthy();
      expect(JSON.stringify(confirmRes.json)).not.toMatch(NO_SIGNING_MATERIAL);
      const confirmReplay = await callRoute(investmentsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investments`,
        body: confirmBody,
        headers: authHeaders(session, buyKey),
      });
      expect(confirmReplay.status).toBe(200);
      expect((confirmReplay.json as { data: { id: string } }).data.id).toBe(investment.id);
      expect(await db.investment.count({ where: { key: `invest:${userId}:${buyKey}` } })).toBe(1);

      const getInvestment = async (): Promise<InvestmentDto> => {
        const res = await callRoute(investmentGET, {
          method: "GET",
          url: `${ORIGIN}/api/v1/investments/${investment.id}`,
          headers: cookieOnly(session),
          params: { id: investment.id },
        });
        expect(res.status).toBe(200);
        return (res.json as { data: InvestmentDto }).data;
      };
      for (let i = 0; i < 15; i += 1) {
        await drainJobs();
        await handle.mine(3);
        await touchReference();
        const current = await getInvestment();
        if (["filled", "partial", "failed"].includes(current.status)) break;
      }
      const filled = await getInvestment();
      expect(filled.status).toBe("filled");
      expect(BigInt(filled.amount_out!)).toBeGreaterThan(0n);
      // The operation settled with a real local receipt.
      const buyOp = await db.onchainOperation.findUniqueOrThrow({
        where: { id: investment.operation_id! },
      });
      expect(buyOp.status).toBe("finalized");
      const buyReceipt = await handle.receipt(buyOp.txHash as Hex);
      expect(buyReceipt.status).toBe("success");

      // 6. Holdings over HTTP: portfolio shows the filled position with cost basis.
      const portfolio = await stepPortfolio(session);
      const holding = portfolio.holdings.find((h) => h.stock_id === stock.id);
      expect(holding).toBeTruthy();
      expect(BigInt(holding!.quantity)).toBeGreaterThan(0n);
      const position = portfolio.positions.find((p) => p.stock_id === stock.id)!;
      expect(BigInt(position.raw_owned)).toBe(BigInt(holding!.quantity));
      expect(position.cost_basis_usdc).not.toBeNull();
      expect(JSON.stringify(portfolio)).not.toMatch(NO_SIGNING_MATERIAL);

      // 7. Strategy catalog, entry quote and explicit separate consent.
      const stratsRes = await callRoute(strategiesGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/strategies`,
        headers: cookieOnly(session),
      });
      expect(stratsRes.status).toBe(200);
      const lpDto = (stratsRes.json as { data: StrategyDto[] }).data.find((s) => s.id === lpStrategy.id)!;
      expect(lpDto.separate_claim).toBe(true);
      expect(lpDto.input_assets).toContain(stock.assetKey!);
      const stratDetail = await callRoute(strategyGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/strategies/${lpStrategy.id}`,
        headers: cookieOnly(session),
        params: { id: lpStrategy.id },
      });
      expect(stratDetail.status).toBe(200);

      await touchReference();
      const stockHalf = (BigInt(filled.amount_out!) / 2n).toString();
      const enterQuoteRes = await callRoute(strategyQuotesPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/strategy-quotes`,
        body: JSON.stringify({
          strategy_id: lpStrategy.id,
          action: "enter",
          inputs: [
            { asset: settlementKey, raw: "500000" },
            { asset: stock.assetKey!, raw: stockHalf },
          ],
        }),
        headers: authHeaders(session),
      });
      expect(enterQuoteRes.status).toBe(200);
      const enterQuote = (
        enterQuoteRes.json as { data: { id: string; preparatory_swap: boolean } }
      ).data;
      expect(enterQuote.preparatory_swap).toBe(false);

      const stratAuthRes = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify({
          kind: "one_time",
          quote_kind: "strategy",
          quote_id: enterQuote.id,
          policy_version: "api-1",
          disclosure_version: "1",
        }),
        headers: authHeaders(session, randomUUID()),
      });
      expect(stratAuthRes.status).toBe(201);
      const stratAuthId = (stratAuthRes.json as { data: { id: string } }).data.id;

      const enterKey = randomUUID();
      const enterBody = JSON.stringify({ quote_id: enterQuote.id, authorization_id: stratAuthId });
      const enterRes = await callRoute(strategyOperationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/strategy-operations`,
        body: enterBody,
        headers: authHeaders(session, enterKey),
      });
      expect(enterRes.status).toBe(202);
      const enterOp = (enterRes.json as { data: StrategyOperationDto }).data;
      const enterReplay = await callRoute(strategyOperationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/strategy-operations`,
        body: enterBody,
        headers: authHeaders(session, enterKey),
      });
      expect(enterReplay.status).toBe(200);
      expect((enterReplay.json as { data: { operation_id: string } }).data.operation_id).toBe(
        enterOp.operation_id,
      );
      expect(await db.onchainOperation.count({ where: { key: `strat-op:strategy:${userId}:${enterKey}` } })).toBe(1);

      const getStrategyOp = async (): Promise<StrategyOperationDto> => {
        const res = await callRoute(strategyOperationGET, {
          method: "GET",
          url: `${ORIGIN}/api/v1/strategy-operations/${enterOp.operation_id}`,
          headers: cookieOnly(session),
          params: { id: enterOp.operation_id },
        });
        expect(res.status).toBe(200);
        return (res.json as { data: StrategyOperationDto }).data;
      };
      for (let i = 0; i < 20; i += 1) {
        await drainJobs();
        await handle.mine(3);
        await touchReference();
        const current = await getStrategyOp();
        if (["finalized", "reverted", "failed"].includes(current.status)) break;
      }
      expect((await getStrategyOp()).status).toBe("finalized");
      const positionsRes = await callRoute(strategyPositionsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/strategy-positions`,
        headers: cookieOnly(session),
      });
      expect(positionsRes.status).toBe(200);
      const lpPosition = (positionsRes.json as { data: StrategyPositionDto[] }).data.find(
        (p) => p.strategy_id === lpStrategy.id,
      )!;
      expect(lpPosition.state).toBe("active");
      expect(BigInt(lpPosition.receipt_raw)).toBeGreaterThan(0n);

      // 8. Claim the distribution reward, then convert the receipt over HTTP.
      await touchReference();
      const claimQuoteRes = await callRoute(strategyQuotesPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/strategy-quotes`,
        body: JSON.stringify({ strategy_id: stonksStrategy.id, action: "claim" }),
        headers: authHeaders(session),
      });
      expect(claimQuoteRes.status).toBe(200);
      const claimQuote = (claimQuoteRes.json as { data: { id: string } }).data;
      const stonksAuthRes = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify({
          kind: "one_time",
          quote_kind: "strategy",
          quote_id: claimQuote.id,
          policy_version: "api-1",
          disclosure_version: "1",
        }),
        headers: authHeaders(session, randomUUID()),
      });
      expect(stonksAuthRes.status).toBe(201);
      const stonksAuthId = (stonksAuthRes.json as { data: { id: string } }).data.id;
      const claimRes = await callRoute(strategyOperationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/strategy-operations`,
        body: JSON.stringify({ quote_id: claimQuote.id, authorization_id: stonksAuthId }),
        headers: authHeaders(session, randomUUID()),
      });
      expect(claimRes.status).toBe(202);
      const claimOpId = (claimRes.json as { data: { operation_id: string } }).data.operation_id;
      for (let i = 0; i < 20; i += 1) {
        await drainJobs();
        await handle.mine(3);
        await touchReference();
        const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: claimOpId } });
        if (["finalized", "reverted", "failed"].includes(op.status)) break;
      }
      expect(
        (await db.onchainOperation.findUniqueOrThrow({ where: { id: claimOpId } })).status,
      ).toBe("finalized");

      const withReceipt = await stepPortfolio(session);
      expect(withReceipt.receipts.length).toBe(1);
      const receipt = withReceipt.receipts[0]!;
      expect(receipt.source).toBe("stonks_distribution");
      expect(receipt.state).toBe("received_asset");
      expect(receipt.asset).toBe(stock.assetKey);
      expect(receipt.tx_hash).toBeTruthy();

      await touchReference();
      const standingAuthRes = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify({
          kind: "standing",
          stock_ids: [stock.id],
          strategy_ids: [],
          actions: ["reward_conversion"],
          max_action_ngn: "1000000000000000000",
          max_total_ngn: "1000000000000000000",
          max_fee_bps: 10000,
          max_slippage_bps: 100,
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          policy_version: "api-1",
          disclosure_version: "1",
        }),
        headers: authHeaders(session, randomUUID()),
      });
      expect(standingAuthRes.status).toBe(201);
      const standingAuthId = (standingAuthRes.json as { data: { id: string } }).data.id;
      const convertRes = await callRoute(receiptConvertPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/reward-receipts/${receipt.id}/convert`,
        body: JSON.stringify({ authorization_id: standingAuthId }),
        headers: authHeaders(session, randomUUID()),
        params: { id: receipt.id },
      });
      expect(convertRes.status).toBe(202);
      const convertOpId = (convertRes.json as { data: { operation_id: string } }).data.operation_id;
      for (let i = 0; i < 20; i += 1) {
        await drainJobs();
        await handle.mine(3);
        await touchReference();
        const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: convertOpId } });
        if (["finalized", "reverted", "failed"].includes(op.status)) break;
      }
      // The conversion finalized and its proceeds were recognized automatically.
      const converted = await stepPortfolio(session);
      const convertedReceipt = converted.receipts.find((r) => r.id === receipt.id)!;
      expect(convertedReceipt.state).toBe("available");
      const weeks = await stepEarnings(session);
      expect(weeks.length).toBe(1);
      expect(BigInt(weeks[0]!.earned_usdc)).toBeGreaterThan(0n);
      expect(weeks[0]!.status).toBe("pending");

      // 9. Preference with versioned conversion consent, then the Friday payout.
      const prefRes = await callRoute(preferencePUT, {
        method: "PUT",
        url: `${ORIGIN}/api/v1/earnings/preference`,
        body: JSON.stringify({
          mode: "payout",
          consent_version: "api-consent-v1",
          allow_background_conversion: true,
          max_conversion_fee_bps: 50,
          max_fx_bps: 25,
        }),
        headers: authHeaders(session),
      });
      expect(prefRes.status).toBe(200);
      expect(prefRes.json as { data: Record<string, unknown> }).toMatchObject({
        data: {
          mode: "payout",
          consent_version: "api-consent-v1",
          allow_background_conversion: true,
          max_conversion_fee_bps: 50,
          max_fx_bps: 25,
        },
      });
      setNow(payoutAt.toISOString()); // Friday 08:00 Lagos: payout batch
      for (let i = 0; i < 6; i += 1) {
        await drainJobs();
        await handle.mine(3);
        await touchReference();
      }
      const paidWeeks = await stepEarnings(session);
      expect(paidWeeks[0]!.status).toBe("paid");
      expect(BigInt(paidWeeks[0]!.paid_usdc)).toBeGreaterThan(0n);

      // 10. Failed buy cash fallback: a named scenario makes the executed swap fall
      // below the quoted minimum; the reservation is released back to cash.
      const cashBefore = await ledgerService.balance(acct.userCash(userId, "testnet"));
      await touchReference();
      const failQuoteRes = await callRoute(investmentQuotePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investments/quote`,
        body: JSON.stringify({ stock_id: failStock.id, side: "buy", input_raw: "5000000", slippage_bps: 0 }),
        headers: authHeaders(session),
      });
      expect(failQuoteRes.status).toBe(200);
      const failQuote = (failQuoteRes.json as { data: InvestmentQuoteDto }).data;
      expect(failQuote.provider_id).toBe("o1");
      const failAuthRes = await callRoute(authorizationsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investment-authorizations`,
        body: JSON.stringify({
          kind: "one_time",
          quote_kind: "investment",
          quote_id: failQuote.id,
          policy_version: "api-1",
          disclosure_version: "1",
        }),
        headers: authHeaders(session, randomUUID()),
      });
      expect(failAuthRes.status).toBe(201);
      const failAuthId = (failAuthRes.json as { data: { id: string } }).data.id;
      const failKey = randomUUID();
      const failConfirm = await callRoute(investmentsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/investments`,
        body: JSON.stringify({ quote_id: failQuote.id, authorization_id: failAuthId }),
        headers: authHeaders(session, failKey),
      });
      expect(failConfirm.status).toBe(202);
      const failInv = (failConfirm.json as { data: InvestmentDto }).data;
      const scenRes = await callRoute(onchainScenariosPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/beta/onchain-scenarios`,
        body: JSON.stringify({ operation_id: failInv.operation_id, scenario: "partial_fill" }),
        headers: authHeaders(session, randomUUID()),
      });
      expect(scenRes.status).toBe(200);
      for (let i = 0; i < 15; i += 1) {
        await drainJobs();
        await handle.mine(3);
        await touchReference();
        const res = await callRoute(investmentGET, {
          method: "GET",
          url: `${ORIGIN}/api/v1/investments/${failInv.id}`,
          headers: cookieOnly(session),
          params: { id: failInv.id },
        });
        const current = (res.json as { data: InvestmentDto }).data;
        if (["filled", "partial", "failed"].includes(current.status)) break;
      }
      const failFinal = await callRoute(investmentGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/investments/${failInv.id}`,
        headers: cookieOnly(session),
        params: { id: failInv.id },
      });
      const failDto = (failFinal.json as { data: InvestmentDto }).data;
      expect(failDto.status).toBe("failed");
      // The quote did not consent to partial fills, so the smaller input fill
      // cannot finalize: the contract reverts MIN_OUTPUT_BREACH.
      expect(failDto.failure_reason).toBe("MIN_OUTPUT_BREACH");
      expect(await ledgerService.balance(acct.userCash(userId, "testnet"))).toBe(cashBefore);

      // 11. No gas top-up: the user's EOA and execution account never hold native
      // balance; the relayer sponsor paid for every operation.
      const wallet = await db.wallet.findUniqueOrThrow({
        where: { userId_family: { userId, family: "evm" } },
      });
      const client = publicClientFor();
      expect(await client.getBalance({ address: wallet.address as Address })).toBe(0n);
      expect(await client.getBalance({ address: wallet.executionAddress as Address })).toBe(0n);
      const sponsor = await db.sponsorBudget.findFirst({ where: { scope: { startsWith: "daily:" } } });
      expect(sponsor).not.toBeNull();
      expect(fromDbRaw(sponsor!.spentWei)).toBeGreaterThan(0n);

      // 12. Committed domain changes are recorded as user events for SSE/polling.
      const eventTypes = (
        await db.userEvent.findMany({ where: { userId }, select: { type: true } })
      ).map((e) => e.type);
      expect(eventTypes).toContain("investment.updated");
      expect(eventTypes).toContain("strategy.operation.updated");
      expect(eventTypes).toContain("strategy.position.updated");

      // 13. Cross-user access is a 404 everywhere.
      const other = await makeVerifiedUser();
      const otherSession = await sessionFor(other.id);
      const crossInv = await callRoute(investmentGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/investments/${investment.id}`,
        headers: cookieOnly(otherSession),
        params: { id: investment.id },
      });
      expect(crossInv.status).toBe(404);
      const crossOp = await callRoute(strategyOperationGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/strategy-operations/${enterOp.operation_id}`,
        headers: cookieOnly(otherSession),
        params: { id: enterOp.operation_id },
      });
      expect(crossOp.status).toBe(404);
      const crossConvert = await callRoute(receiptConvertPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/reward-receipts/${receipt.id}/convert`,
        body: JSON.stringify({ authorization_id: authId }),
        headers: authHeaders(otherSession, randomUUID()),
        params: { id: receipt.id },
      });
      expect(crossConvert.status).toBe(404);
      const crossRevoke = await callRoute(authorizationDELETE, {
        method: "DELETE",
        url: `${ORIGIN}/api/v1/investment-authorizations/${authId}`,
        headers: authHeaders(otherSession),
        params: { id: authId },
      });
      expect(crossRevoke.status).toBe(404);
      const crossScenario = await callRoute(onchainScenariosPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/beta/onchain-scenarios`,
        body: JSON.stringify({ operation_id: enterOp.operation_id, scenario: "zero_rewards" }),
        headers: authHeaders(otherSession, randomUUID()),
      });
      expect(crossScenario.status).toBe(404);

      // 14. Operator evidence: every enabled replica with its local evidence, and
      // the onchain operations view. Customer routes never expose this.
      const operator = await makeUser({ role: "operator" });
      const operatorSession = await sessionFor(operator.id);
      const customerOps = await callRoute(integrationsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/ops/integrations`,
        headers: cookieOnly(session),
      });
      expect(customerOps.status).toBe(403);
      const integRes = await callRoute(integrationsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/ops/integrations`,
        headers: cookieOnly(operatorSession),
      });
      expect(integRes.status).toBe(200);
      const providers = integRes.json as { data: IntegrationEvidenceDto[] };
      expect(providers.data.length).toBe(6);
      for (const p of providers.data) {
        expect(p.beta_adapter).toBe("local_testnet_replica");
        expect(p.actual_integration).toBe("disabled_unverified");
        expect(p.testnet_evidence).toBe("unverified");
        expect(p.real_provider_calls).toBe(0);
        expect(p.evidence_id).toMatch(/^evidence:/);
        expect(p.integration_kind).toBe("local_testnet_replica");
      }
      const opsRes = await callRoute(onchainOpsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/ops/onchain-operations`,
        headers: cookieOnly(operatorSession),
      });
      expect(opsRes.status).toBe(200);
      const ops = (opsRes.json as { data: OnchainOpsDto }).data;
      expect(ops.network).toMatchObject({ chain_id: 31337, verified: true });
      expect(ops.unresolved_operations).toBe(0);
      expect(Array.isArray(ops.operation_holds)).toBe(true);
      expect(JSON.stringify(opsRes.json)).not.toMatch(NO_SIGNING_MATERIAL);

      // The investment list stays owner-scoped and private.
      const listRes = await callRoute(investmentsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/investments`,
        headers: cookieOnly(session),
      });
      expect(listRes.status).toBe(200);
      expect(listRes.headers.get("cache-control")).toContain("no-store");
      // buy + reward conversion sell + failed buy
      expect((listRes.json as { data: InvestmentDto[] }).data.length).toBe(3);
    },
  );
});
