import { randomUUID } from "node:crypto";

import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { GET as automationsGET } from "@/app/api/v1/app/automations/route";
import { DELETE as automationDELETE } from "@/app/api/v1/app/automations/[id]/route";
import { POST as automationRenewPOST } from "@/app/api/v1/app/automations/[id]/renew/route";
import { GET as homeGET } from "@/app/api/v1/app/home/route";
import { GET as profileGET, PATCH as profilePATCH } from "@/app/api/v1/app/profile/route";
import { GET as sessionGET } from "@/app/api/v1/app/session/route";
import { POST as earnPreviewPOST } from "@/app/api/v1/app/earn/[id]/preview/route";
import { POST as earnJoinPOST } from "@/app/api/v1/app/earn/[id]/join/route";
import type { AppAutomationDto } from "@/backend/services/app/automations";
import type { AppHomeDto } from "@/backend/services/app/home";
import type { AppProfileDto } from "@/backend/services/app/profile";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { authorizationService } from "@/backend/services/authorizations";
import { earningsService } from "@/backend/services/earnings";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { hydrexPoolAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { publicClientFor, settlementAssetKey } from "@/backend/services/onchain/testnet";
import { ratesService } from "@/backend/services/rates";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import type { AppSessionDto } from "@/types/app";
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
      key: `hydrex-lp-settings-${randomUUID()}`,
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
  return { handle, stock, strategy, ...customer };
}

async function joinEarn(cookie: string, strategyId: string, stockId: string) {
  await touchReference(stockId);
  const previewRes = await callAppRoute(earnPreviewPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/earn/${strategyId}/preview`,
    cookie,
    params: { id: strategyId },
    body: { amount_kobo: "500000" },
  });
  expect(previewRes.status).toBe(200);
  const previewId = dataOf<{ preview_id: string }>(previewRes.json).preview_id;
  const joinRes = await callAppRoute(earnJoinPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/earn/${strategyId}/join`,
    cookie,
    params: { id: strategyId },
    body: {
      preview_id: previewId,
      pin: "1357",
      accepted_risk_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
    },
    headers: { "idempotency-key": `settings-join-${randomUUID()}` },
  });
  expect(joinRes.status).toBe(201);
}

async function listAutomations(cookie: string): Promise<AppAutomationDto[]> {
  const res = await callAppRoute(automationsGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/automations`,
    cookie,
  });
  expect(res.status).toBe(200);
  return dataOf<AppAutomationDto[]>(res.json);
}

describe("customer automations, profile and settings", () => {
  it("lists automations without order consents", async () => {
    const { cookie, userId, stock, strategy } = await setupWorld("set-1@v3st.test");
    await joinEarn(cookie, strategy.id, stock.id);
    // A standing order consent (waiting order) is not an automation.
    await db.investmentAuthorization.create({
      data: {
        userId,
        key: `auth:${userId}:order:fixture-${randomUUID()}`,
        kind: "standing",
        stockIds: [stock.id],
        strategyIds: [],
        actions: ["order_buy"],
        maxActionNgn: toDbRaw(1_000_000n),
        maxTotalNgn: toDbRaw(1_000_000n),
        maxFeeBps: 100,
        maxSlippageBps: 100,
        limitPriceMicroUsd: 2_100_000n,
        expiresAt: new Date(now().getTime() + 86_400_000),
        policyVersion: policy.app.policyVersion,
        disclosureVersion: CUSTOMER_DOCUMENTS.risks.version,
        requestHash: "fixture",
      },
    });

    const automations = await listAutomations(cookie);
    expect(automations).toHaveLength(1);
    expect(automations[0]!.title).toBe("Collect your Test Stock A Earn fees");
    expect(automations[0]!.detail).toContain("Thursday");
    expect(automations[0]!.active).toBe(true);
    expect(automations[0]!.needs_renewal).toBe(false);
  });

  it("stops weekly collection when turned off", async () => {
    const { cookie, userId, stock, strategy } = await setupWorld("set-2@v3st.test");
    await joinEarn(cookie, strategy.id, stock.id);
    const automations = await listAutomations(cookie);
    expect(automations).toHaveLength(1);

    // The harvest schedules claims only while the standing claim consent is live.
    const standingBefore = await authorizationService.findStanding(userId, "claim", {
      strategyId: strategy.id,
    });
    expect(standingBefore).not.toBeNull();

    const revokeRes = await callAppRoute(automationDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/automations/${automations[0]!.id}`,
      cookie,
      params: { id: automations[0]!.id },
    });
    expect(revokeRes.status).toBe(200);
    expect(dataOf<AppAutomationDto>(revokeRes.json).active).toBe(false);

    const standingAfter = await authorizationService.findStanding(userId, "claim", {
      strategyId: strategy.id,
    });
    expect(standingAfter).toBeNull();
    const { recorded } = await earningsService.harvest(lagosWeek(now()));
    expect(recorded).toBe(0);
    void stock;
  });

  it("renews with the PIN and flags renewal five days ahead", async () => {
    const { cookie, stock, strategy } = await setupWorld("set-3@v3st.test");
    await joinEarn(cookie, strategy.id, stock.id);
    const before = await listAutomations(cookie);
    expect(before).toHaveLength(1);
    const original = before[0]!;

    // 26 days in: 4 days of the 30-day consent remain, inside the 5-day window.
    setNow(new Date(now().getTime() + 26 * 86_400_000).toISOString());
    const soon = await listAutomations(cookie);
    expect(soon[0]!.needs_renewal).toBe(true);
    expect(soon[0]!.active).toBe(true);

    const homeRes = await callAppRoute(homeGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/home`,
      cookie,
    });
    expect(homeRes.status).toBe(200);
    const home = dataOf<AppHomeDto>(homeRes.json);
    const item = home.action_items.find((i) => i.kind === "renew_automation");
    expect(item).toBeTruthy();
    expect(item!.title).toBe("Keep your automatic actions on");
    expect(item!.link).toBe("/settings/automations");
    expect(item!.detail).toMatch(/^Renew before \d{4}-\d{2}-\d{2}\.$/);

    const renewRes = await callAppRoute(automationRenewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/automations/${original.id}/renew`,
      cookie,
      params: { id: original.id },
      body: { pin: "1357" },
    });
    expect(renewRes.status).toBe(200);
    const renewed = dataOf<AppAutomationDto>(renewRes.json);
    expect(renewed.id).not.toBe(original.id);
    expect(renewed.active).toBe(true);
    expect(renewed.needs_renewal).toBe(false);
    expect(new Date(renewed.expires_at).getTime()).toBeGreaterThan(
      new Date(original.expires_at).getTime(),
    );

    const oldRow = await db.investmentAuthorization.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(oldRow.revokedAt).not.toBeNull();
    const after = await listAutomations(cookie);
    expect(after).toHaveLength(2);
    const active = after.filter((a) => a.active);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(renewed.id);
  });

  it("shows the sign-in email and validates the preferred name", async () => {
    await setupWorld("set-4@v3st.test");
    const { cookie } = await readyCustomer("ada@v3st.test");

    const profileRes = await callAppRoute(profileGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/profile`,
      cookie,
    });
    expect(profileRes.status).toBe(200);
    const profile = dataOf<AppProfileDto>(profileRes.json);
    expect(profile.email).toBe("ada@v3st.test");
    expect(profile.identity).toEqual({ verified: true, level: "higher" });
    expect(profile.bank_account).not.toBeNull();

    const okRes = await callAppRoute(profilePATCH, {
      method: "PATCH",
      url: `${ORIGIN}/api/v1/app/profile`,
      cookie,
      body: { preferred_name: "Ada" },
    });
    expect(okRes.status).toBe(200);
    expect(dataOf<AppProfileDto>(okRes.json).preferred_name).toBe("Ada");

    const sessionRes = await callAppRoute(sessionGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/session`,
      cookie,
    });
    expect(dataOf<AppSessionDto>(sessionRes.json)).toMatchObject({
      signed_in: true,
      customer: { display_name: "Ada" },
    });

    const badRes = await callAppRoute(profilePATCH, {
      method: "PATCH",
      url: `${ORIGIN}/api/v1/app/profile`,
      cookie,
      body: { preferred_name: "Ada2" },
    });
    expect(badRes.status).toBe(422);
    expect((badRes.json as { code: string }).code).toBe("CHECK_DETAILS");
  });
});
