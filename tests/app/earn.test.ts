import { randomUUID } from "node:crypto";

import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { GET as earnGET } from "@/app/api/v1/app/earn/route";
import { GET as earnProductGET } from "@/app/api/v1/app/earn/[id]/route";
import { POST as earnPreviewPOST } from "@/app/api/v1/app/earn/[id]/preview/route";
import { POST as earnJoinPOST } from "@/app/api/v1/app/earn/[id]/join/route";
import { POST as withdrawPreviewPOST } from "@/app/api/v1/app/earn/positions/[id]/withdraw/preview/route";
import { POST as withdrawPOST } from "@/app/api/v1/app/earn/positions/[id]/withdraw/route";
import { GET as earningsGET } from "@/app/api/v1/app/earnings/route";
import { PUT as preferencePUT } from "@/app/api/v1/app/earnings/preference/route";
import { GET as stockGET } from "@/app/api/v1/app/stocks/[id]/route";
import type {
  AppEarnPositionDto,
  AppEarnPreviewDto,
  AppEarnProductDto,
  AppEarnWithdrawPreviewDto,
} from "@/backend/services/app/earn";
import type { AppEarningsDto } from "@/backend/services/app/earnings";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { now } from "@/backend/clock";
import { earningsService } from "@/backend/services/earnings";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { hydrexPoolAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { publicClientFor, settlementAssetKey } from "@/backend/services/onchain/testnet";
import { ratesService } from "@/backend/services/rates";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import type { Prisma } from "@/server/prisma";
import { toDbRaw } from "@/utils/asset-units";

import { callAppRoute, ORIGIN, readyCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { fundCash, seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";

useTestDatabase();

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

const SEED_SETTLEMENT = 1_000_000_000_000n;
const SEED_STOCK = 500_000n * 10n ** 18n;

async function touchReference(stockId: string) {
  await db.stock.update({
    where: { id: stockId },
    data: { referenceAsOf: now(), referencePriceMicroUsd: 2_000_000n, referenceBasis: "share_price" },
  });
}

async function setupWorld(email: string) {
  const handle = await testnet();
  await ensureTestnetNetwork();
  await seedTreasury("testnet", 1_000_000_000_000n);
  const { stock, token } = await makeTestnetStock({
    symbol: "TSTA",
    referencePriceMicroUsd: 2_000_000n,
  });
  await db.stock.update({ where: { id: stock.id }, data: { displayTicker: "TSTA" } });
  await handle.seedO1Pool(token, SEED_SETTLEMENT, SEED_STOCK);
  const pool = await handle.deployHydrexPool(token);
  await db.stock.update({
    where: { id: stock.id },
    data: { provenance: { ...(stock.provenance as object), hydrexPool: pool } },
  });
  const settlementKey = settlementAssetKey(handle.manifest);
  await handle.mintSettlement(handle.account.address, SEED_SETTLEMENT);
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({
      abi: stockTokenAbi,
      functionName: "transfer",
      args: [handle.account.address, SEED_STOCK],
    }),
  });
  await handle.sendTx({
    to: handle.settlement,
    data: encodeFunctionData({
      abi: settlementTokenAbi,
      functionName: "approve",
      args: [pool, SEED_SETTLEMENT],
    }),
  });
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [pool, SEED_STOCK] }),
  });
  await handle.sendTx({
    to: pool,
    data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "seed", args: [SEED_SETTLEMENT, SEED_STOCK] }),
  });
  const strategy = await db.strategy.create({
    data: {
      providerId: "hydrex",
      key: `hydrex-lp-earn-${randomUUID()}`,
      name: "TSTA LP replica",
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [settlementKey, stock.assetKey!],
      receiptAsset: `lp:31337:${pool.toLowerCase()}`,
      rewardAssets: [stock.assetKey!],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: { pool, stockId: stock.id, chainId: 31337 },
    },
  });
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  setNow(new Date(Math.max(Date.now(), Number(block.timestamp) * 1000)).toISOString());
  ratesService.clearCache();
  await touchReference(stock.id);
  const customer = await readyCustomer(email);
  const ref = await testnetWalletService.ensureExecutionAccount(customer.userId);
  await handle.mintSettlement(ref.accountAddress, 1_000_000_000n);
  await fundCash(customer.userId, 100_000_000n, "testnet");
  return { handle, stock, token, pool, strategy, settlementKey, ...customer };
}

// Drives the user's onchain ops to finality without advancing the fake clock:
// drainJobs would push now() past the quote deadline and the ops could never
// be prepared.
async function settle(
  handle: Awaited<ReturnType<typeof testnet>>,
  stockId: string,
  userId: string,
) {
  const { strategyService } = await import("@/backend/services/strategies");
  for (let i = 0; i < 10; i += 1) {
    await touchReference(stockId);
    const ops = await db.onchainOperation.findMany({ where: { userId } });
    let allFinal = ops.length > 0;
    for (const op of ops) {
      if (["finalized", "reverted", "failed"].includes(op.status)) continue;
      allFinal = false;
      if (op.kind === "strategy") await strategyService.progress(op.id);
      await handle.mine(3);
    }
    if (allFinal) break;
  }
  await touchReference(stockId);
}

async function listProducts(cookie: string): Promise<AppEarnProductDto[]> {
  const res = await callAppRoute(earnGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/earn`,
    cookie,
  });
  expect(res.status).toBe(200);
  return dataOf<AppEarnProductDto[]>(res.json);
}

async function preview(cookie: string, productId: string, amountKobo: string) {
  return callAppRoute(earnPreviewPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/earn/${productId}/preview`,
    cookie,
    params: { id: productId },
    body: { amount_kobo: amountKobo },
  });
}

async function join(
  cookie: string,
  productId: string,
  body: { preview_id: string; pin: string; accepted_risk_version: string },
  key: string,
) {
  return callAppRoute(earnJoinPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/earn/${productId}/join`,
    cookie,
    params: { id: productId },
    body,
    headers: { "idempotency-key": key },
  });
}

const CURRENT_RISK_VERSION = CUSTOMER_DOCUMENTS["earn-risks"].version;

describe("customer Earn products and earnings", () => {
  it("never offers experimental or locked strategies", async () => {
    const { cookie, strategy, stock } = await setupWorld("earn-list@v3st.test");
    const experimental = await db.strategy.create({
      data: {
        providerId: "hydrex",
        key: `hydrex-lp-exp-${randomUUID()}`,
        name: "Experimental pool",
        version: "replica-1.0.0",
        disclosureVersion: "1",
        inputAssets: strategy.inputAssets as string[],
        receiptAsset: strategy.receiptAsset,
        rewardAssets: [],
        separateClaim: true,
        experimental: true,
        capBps: 2000,
        maxUsdEquivalent: toDbRaw(100_000_000n),
        provenance: strategy.provenance as Prisma.InputJsonValue,
      },
    });
    await db.strategy.create({
      data: {
        providerId: "hydrex",
        key: `hydrex-lp-lock-${randomUUID()}`,
        name: "Locked pool",
        version: "replica-1.0.0",
        disclosureVersion: "1",
        inputAssets: strategy.inputAssets as string[],
        receiptAsset: strategy.receiptAsset,
        rewardAssets: [],
        separateClaim: true,
        permanentLock: true,
        capBps: 2000,
        maxUsdEquivalent: toDbRaw(100_000_000n),
        provenance: strategy.provenance as Prisma.InputJsonValue,
      },
    });

    const products = await listProducts(cookie);
    expect(products.map((p) => p.id)).toEqual([strategy.id]);
    expect(products[0]!.minimum_kobo).toBe("500000");
    expect(products[0]!.documents).toEqual(["earn-risks"]);
    expect(products[0]!.title).toContain("trading fees");

    const detail = await callAppRoute(earnProductGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/earn/${strategy.id}`,
      cookie,
      params: { id: strategy.id },
    });
    expect(detail.status).toBe(200);
    expect(dataOf<AppEarnProductDto>(detail.json).stock.id).toBe(stock.id);

    const hidden = await callAppRoute(earnProductGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/earn/${experimental.id}`,
      cookie,
      params: { id: experimental.id },
    });
    expect(hidden.status).toBe(404);

    // The catalog detail links the stock to its Earn product.
    const stockRes = await callAppRoute(stockGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/stocks/${stock.id}`,
      cookie,
      params: { id: stock.id },
    });
    expect(stockRes.status).toBe(200);
    expect((dataOf<{ earn_product_id: string | null }>(stockRes.json)).earn_product_id).toBe(
      strategy.id,
    );
  });

  it("needs the Earn risk document and the PIN", async () => {
    const { cookie, strategy } = await setupWorld("earn-doc@v3st.test");
    const previewRes = await preview(cookie, strategy.id, "500000");
    expect(previewRes.status).toBe(200);
    const previewDto = dataOf<AppEarnPreviewDto>(previewRes.json);
    expect(previewDto.risk_document).toEqual({ slug: "earn-risks", version: CURRENT_RISK_VERSION });
    expect(previewDto.you_add_kobo).toBe("500000");

    const stale = await join(
      cookie,
      strategy.id,
      { preview_id: previewDto.preview_id, pin: "1357", accepted_risk_version: "stale-0" },
      "earn-stale-1",
    );
    expect(stale.status).toBe(409);
    expect((stale.json as { code: string }).code).toBe("DOCUMENT_UPDATED");

    const wrongPin = await join(
      cookie,
      strategy.id,
      { preview_id: previewDto.preview_id, pin: "0000", accepted_risk_version: CURRENT_RISK_VERSION },
      "earn-pin-1",
    );
    expect(wrongPin.status).toBe(422);
    expect((wrongPin.json as { code: string }).code).toBe("PIN_INCORRECT");

    const tooSmall = await preview(cookie, strategy.id, "499999");
    expect(tooSmall.status).toBe(422);
  });

  it("joins once and sets up weekly collection", async () => {
    const { handle, cookie, userId, stock, strategy } = await setupWorld("earn-join@v3st.test");
    const previewRes = await preview(cookie, strategy.id, "500000");
    expect(previewRes.status).toBe(200);
    const previewDto = dataOf<AppEarnPreviewDto>(previewRes.json);

    const joinRes = await join(
      cookie,
      strategy.id,
      { preview_id: previewDto.preview_id, pin: "1357", accepted_risk_version: CURRENT_RISK_VERSION },
      "earn-join-1",
    );
    expect(joinRes.status).toBe(201);
    const dto = dataOf<AppEarnPositionDto>(joinRes.json);
    expect(["processing", "active"]).toContain(dto.status);

    await settle(handle, stock.id, userId);

    const ops = await db.onchainOperation.findMany({
      where: { key: { startsWith: `strat-op:earn:${userId}:` } },
    });
    expect(ops).toHaveLength(1);
    const standings = await db.investmentAuthorization.findMany({
      where: { userId, kind: "standing", revokedAt: null },
    });
    expect(standings).toHaveLength(1);
    expect(standings[0]!.actions).toEqual(["claim", "reward_conversion"]);
    expect(standings[0]!.strategyIds).toEqual([strategy.id]);

    const productRes = await callAppRoute(earnProductGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/earn/${strategy.id}`,
      cookie,
      params: { id: strategy.id },
    });
    expect(dataOf<AppEarnProductDto>(productRes.json).position?.status).toBe("active");

    // A second join creates a new operation but reuses the standing consent.
    const preview2 = await preview(cookie, strategy.id, "500000");
    const preview2Dto = dataOf<AppEarnPreviewDto>(preview2.json);
    const join2 = await join(
      cookie,
      strategy.id,
      { preview_id: preview2Dto.preview_id, pin: "1357", accepted_risk_version: CURRENT_RISK_VERSION },
      "earn-join-2",
    );
    expect(join2.status).toBe(201);
    const opsAfter = await db.onchainOperation.findMany({
      where: { key: { startsWith: `strat-op:earn:${userId}:` } },
    });
    expect(opsAfter).toHaveLength(2);
    const standingsAfter = await db.investmentAuthorization.findMany({
      where: { userId, kind: "standing", revokedAt: null },
    });
    expect(standingsAfter).toHaveLength(1);

    // The weekly harvest schedules one claim for the active position.
    const week = lagosWeek(now());
    const { recorded } = await earningsService.harvest(week);
    expect(recorded).toBe(1);
  });

  it("withdraws a position", async () => {
    const { handle, cookie, userId, stock, strategy } = await setupWorld("earn-withdraw@v3st.test");
    const previewRes = await preview(cookie, strategy.id, "500000");
    const previewDto = dataOf<AppEarnPreviewDto>(previewRes.json);
    const joinRes = await join(
      cookie,
      strategy.id,
      { preview_id: previewDto.preview_id, pin: "1357", accepted_risk_version: CURRENT_RISK_VERSION },
      "earn-wd-join",
    );
    expect(joinRes.status).toBe(201);
    await settle(handle, stock.id, userId);
    const positionId = dataOf<AppEarnPositionDto>(joinRes.json).id;

    const withdrawPreviewRes = await callAppRoute(withdrawPreviewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/earn/positions/${positionId}/withdraw/preview`,
      cookie,
      params: { id: positionId },
    });
    expect(withdrawPreviewRes.status).toBe(200);
    const withdrawPreview = dataOf<AppEarnWithdrawPreviewDto>(withdrawPreviewRes.json);
    expect(withdrawPreview.position_id).toBe(positionId);

    const withdrawRes = await callAppRoute(withdrawPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/earn/positions/${positionId}/withdraw`,
      cookie,
      params: { id: positionId },
      body: { preview_id: withdrawPreview.preview_id, pin: "1357" },
      headers: { "idempotency-key": "earn-wd-1" },
    });
    expect(withdrawRes.status).toBe(201);
    expect(dataOf<AppEarnPositionDto>(withdrawRes.json).status).toBe("withdrawing");

    await settle(handle, stock.id, userId);
    const productRes = await callAppRoute(earnProductGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/earn/${strategy.id}`,
      cookie,
      params: { id: strategy.id },
    });
    expect(dataOf<AppEarnProductDto>(productRes.json).position?.status).toBe("withdrawn");
  });

  it("sets the earnings choice with limits in words", async () => {
    const { cookie, userId, stock } = await setupWorld("earn-pref@v3st.test");
    const res = await callAppRoute(preferencePUT, {
      method: "PUT",
      url: `${ORIGIN}/api/v1/app/earnings/preference`,
      cookie,
      body: { choice: "reinvest", stock_id: stock.id, pin: "1357" },
    });
    expect(res.status).toBe(200);
    const dto = dataOf<AppEarningsDto>(res.json);
    expect(dto.choice).toBe("reinvest");
    expect(dto.reinvest_stock?.id).toBe(stock.id);
    expect(dto.limits).toHaveLength(3);
    expect(dto.minimum_payout_kobo).toBe("200000");

    const standings = await db.investmentAuthorization.findMany({
      where: { userId, kind: "standing", revokedAt: null },
    });
    const reinvest = standings.filter((s) => s.actions.includes("reinvest"));
    expect(reinvest).toHaveLength(1);
    expect(reinvest[0]!.stockIds).toEqual([stock.id]);

    const summaryRes = await callAppRoute(earningsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/earnings`,
      cookie,
    });
    expect(summaryRes.status).toBe(200);
    expect(dataOf<AppEarningsDto>(summaryRes.json).choice).toBe("reinvest");
  });
});
