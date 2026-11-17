import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { authorizationService } from "@/backend/services/authorizations";
import { earningsBatchService } from "@/backend/services/earnings/batch";
import { earningsService } from "@/backend/services/earnings";
import { ledgerService } from "@/backend/services/ledger";
import { earningHarvested } from "@/backend/services/ledger/postings";
import { publicClientFor, settlementAssetKey } from "@/backend/services/onchain/testnet";
import { ratesService } from "@/backend/services/rates";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { walletService } from "@/backend/services/wallets";
import { db, withTx } from "@/server/db";
import { toDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { makeBankAccount, makeVerifiedUser, seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

const WEEK = "2026-11-16";
const AMOUNT = 3_000_000n; // $3 in micro-USD

async function touchReference(stockId: string) {
  await db.stock.update({
    where: { id: stockId },
    data: { referenceAsOf: now(), referencePriceMicroUsd: 2_000_000n, referenceBasis: "share_price" },
  });
}

async function setupOnchainReinvest() {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  await seedTreasury("testnet", 1_000_000_000_000n);
  const { stock, token } = await makeTestnetStock({
    symbol: "REIN",
    referencePriceMicroUsd: 2_000_000n,
  });
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  setNow(new Date(Math.max(Date.now(), Number(block.timestamp) * 1000)).toISOString());
  ratesService.clearCache();
  await touchReference(stock.id);
  const u = await makeVerifiedUser("ada_tier2");
  await makeBankAccount(u.id);
  await walletService.ensureUserWallets(u.id);
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  await handle.mintSettlement(ref.accountAddress, 1_000_000_000n);
  await earningsService.setPreference(u.id, { mode: "reinvest", stock_id: stock.id });
  await withTx(async (tx) => {
    const receipt = await tx.rewardReceipt.create({
      data: {
        networkId: network.id,
        source: "hydrex_lp_fees",
        beneficiary: ref.accountAddress,
        asset: settlementAssetKey(handle.manifest),
        amountRaw: toDbRaw(AMOUNT),
        week: WEEK,
        state: "available",
      },
    });
    await tx.earning.create({
      data: {
        userId: u.id,
        stockId: stock.id,
        week: WEEK,
        chain: "testnet",
        amountUsdc: AMOUNT,
        harvestedAt: now(),
        receiptId: receipt.id,
      },
    });
    await tx.earningAllocation.create({
      data: {
        receiptId: receipt.id,
        week: WEEK,
        userId: u.id,
        amountUsdc: toDbRaw(AMOUNT),
        state: "available",
      },
    });
    await ledgerService.post(
      tx,
      earningHarvested({ userId: u.id, stockId: stock.id, week: WEEK, chain: "testnet", amount: AMOUNT }),
    );
  });
  return { handle, stock, u };
}

async function reinvestConsent(userId: string, stockId: string) {
  await authorizationService.create(
    userId,
    {
      kind: "standing",
      stock_ids: [stockId],
      strategy_ids: [],
      actions: ["reinvest"],
      max_action_ngn: 50_000_000n,
      max_total_ngn: 2_000_000_000n,
      max_fee_bps: 100,
      max_slippage_bps: 100,
      expires_at: new Date(now().getTime() + 30 * 86_400_000).toISOString(),
      policy_version: policy.app.policyVersion,
      disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
    },
    `reinvest-consent:${userId}:${stockId}`,
  );
}

async function settle(handle: Awaited<ReturnType<typeof testnet>>, stockId: string) {
  for (let i = 0; i < 6; i += 1) {
    await touchReference(stockId);
    await drainJobs();
    await handle.mine(3);
  }
  await touchReference(stockId);
}

describe("onchain earnings reinvest", () => {
  it("reinvests onchain earnings through the investment pipeline", async () => {
    const { handle, stock, u } = await setupOnchainReinvest();
    await reinvestConsent(u.id, stock.id);

    const r = await earningsBatchService.runBatch(WEEK, now());
    expect(r.reinvested).toBe(1);
    expect(r.skipped.needs_consent).toBe(0);

    const inv = await db.investment.findUniqueOrThrow({
      where: { key: `reinvest:${u.id}:${WEEK}` },
    });
    expect(inv.purpose).toBe("reinvest");
    expect(inv.stockId).toBe(stock.id);
    expect(["reserved", "executing", "filled", "partial"]).toContain(inv.status);

    const earning = await db.earning.findFirstOrThrow({ where: { userId: u.id } });
    expect(earning.reinvestInvestmentId).toBe(inv.id);
    const allocation = await db.earningAllocation.findFirstOrThrow({ where: { userId: u.id } });
    expect(allocation.reinvestInvestmentId).toBe(inv.id);

    await settle(handle, stock.id);
    const filled = await db.investment.findUniqueOrThrow({ where: { id: inv.id } });
    expect(["filled", "partial"]).toContain(filled.status);

    const weeks = await earningsService.list(u.id, { page: 1, size: 10 });
    const week = weeks.data.find((w) => w.week === WEEK);
    expect(week?.status).toBe("reinvested");
  });

  it("skips onchain reinvest without consent", async () => {
    const { u } = await setupOnchainReinvest();

    const r = await earningsBatchService.runBatch(WEEK, now());
    expect(r.reinvested).toBe(0);
    expect(r.skipped.needs_consent).toBe(1);

    const investments = await db.investment.findMany({ where: { userId: u.id } });
    expect(investments).toHaveLength(0);
    const earning = await db.earning.findFirstOrThrow({ where: { userId: u.id } });
    expect(earning.reinvestInvestmentId).toBeNull();
    expect(earning.reinvestTradeId).toBeNull();
  });
});
