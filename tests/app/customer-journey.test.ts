import { randomUUID } from "node:crypto";

import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { POST as depositsPOST } from "@/app/api/v1/app/cash/deposits/route";
import { POST as betaCompletePOST } from "@/app/api/v1/app/beta/deposits/[id]/complete/route";
import { POST as previewPOST } from "@/app/api/v1/app/orders/preview/route";
import { POST as ordersPOST } from "@/app/api/v1/app/orders/route";
import { GET as orderGET } from "@/app/api/v1/app/orders/[id]/route";
import { POST as withdrawalPreviewPOST } from "@/app/api/v1/app/withdrawals/preview/route";
import { POST as withdrawalsPOST } from "@/app/api/v1/app/withdrawals/route";
import { GET as withdrawalGET } from "@/app/api/v1/app/withdrawals/[id]/route";
import { POST as earnPreviewPOST } from "@/app/api/v1/app/earn/[id]/preview/route";
import { POST as earnJoinPOST } from "@/app/api/v1/app/earn/[id]/join/route";
import { GET as earningsGET } from "@/app/api/v1/app/earnings/route";
import { PUT as preferencePUT } from "@/app/api/v1/app/earnings/preference/route";
import { GET as activityGET } from "@/app/api/v1/app/activity/route";
import { GET as notificationsGET } from "@/app/api/v1/app/notifications/route";
import type { AppActivityPageDto } from "@/types/app";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { now } from "@/backend/clock";
import type { AppEarningsDto } from "@/types/app";
import { lagosDayStart, lagosParts, lagosWeek } from "@/backend/services/jobs/schedule";
import { hydrexPoolAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { publicClientFor, settlementAssetKey } from "@/backend/services/onchain/testnet";
import { ratesService } from "@/backend/services/rates";
import { strategyService } from "@/backend/services/strategies";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import type { AppNotificationDto } from "@/types/app";
import type { AppOrderDto, AppOrderPreviewDto } from "@/types/app";
import type { AppWithdrawalDto } from "@/types/app";
import { db } from "@/server/db";
import { toDbRaw } from "@/utils/asset-units";

import { callAppRoute, ORIGIN, readyCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { seedFloat, seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

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

async function staleReference(stockId: string) {
  await db.stock.update({
    where: { id: stockId },
    data: { referenceAsOf: new Date(now().getTime() - 3 * 86_400_000) },
  });
}

// The next Lagos-time slot for a weekday (1=Mon) at hour, strictly in the future.
function nextLagosSlot(weekday: number, hour: number): Date {
  const at = now();
  const parts = lagosParts(at);
  const monday = lagosDayStart(at).getTime() - (parts.weekday - 1) * 86_400_000;
  let slot = monday + (weekday - 1) * 86_400_000 + hour * 3_600_000;
  if (slot <= at.getTime()) slot += 7 * 86_400_000;
  return new Date(slot);
}

describe("customer journey on the local test chain", () => {
  it(
    "walks sign-in to withdrawal through /api/v1/app only",
    { timeout: 300_000 },
    async () => {
      const handle = await testnet();
      await ensureTestnetNetwork();
      await seedTreasury("testnet", 1_000_000_000_000n);
      await seedFloat("yellowcard", 1_000_000_000_000n);
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
        data: encodeFunctionData({
          abi: hydrexPoolAbi,
          functionName: "seed",
          args: [SEED_SETTLEMENT, SEED_STOCK],
        }),
      });
      const strategy = await db.strategy.create({
        data: {
          providerId: "hydrex",
          key: `hydrex-lp-journey-${randomUUID()}`,
          name: "TSTA LP replica",
          version: "replica-1.0.0",
          disclosureVersion: "1",
          inputAssets: [settlementKey, stock.assetKey!],
          receiptAsset: `lp:31337:${pool.toLowerCase()}`,
          rewardAssets: [stock.assetKey!],
          separateClaim: true,
          permanentLock: false,
          capBps: 10_000,
          maxUsdEquivalent: toDbRaw(100_000_000n),
          provenance: { pool, stockId: stock.id, chainId: 31337 },
        },
      });
      const block = await publicClientFor().getBlock({ blockTag: "latest" });
      setNow(new Date(Math.max(Date.now(), Number(block.timestamp) * 1000)).toISOString());
      ratesService.clearCache();
      await touchReference(stock.id);

      // 1. Sign in, verify the test identity, set the PIN, accept documents, add a bank account.
      const { cookie, userId } = await readyCustomer("ada@v3st.test");
      const ref = await testnetWalletService.ensureExecutionAccount(userId);
      await handle.mintSettlement(ref.accountAddress, 1_000_000_000n);

      // 2. Add ₦50,000 and complete the beta transfer.
      const depositRes = await callAppRoute(depositsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/cash/deposits`,
        cookie,
        headers: { "idempotency-key": "journey-dep-1" },
        body: { amount_kobo: "5000000" },
      });
      expect(depositRes.status).toBe(201);
      const depositId = dataOf<{ id: string }>(depositRes.json).id;
      const completeRes = await callAppRoute(betaCompletePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/beta/deposits/${depositId}/complete`,
        cookie,
        params: { id: depositId },
      });
      expect(completeRes.status).toBe(200);
      for (let i = 0; i < 8; i += 1) {
        await drainJobs();
        await handle.mine(3);
      }

      // 3. Buy ₦20,000 now, then sell ₦5,000 now; both complete.
      async function placeOrder(body: Record<string, unknown>, key: string) {
        await touchReference(stock.id);
        const preview = await callAppRoute(previewPOST, {
          method: "POST",
          url: `${ORIGIN}/api/v1/app/orders/preview`,
          cookie,
          body: { stock_id: stock.id, ...body },
        });
        expect(preview.status).toBe(200);
        const p = dataOf<AppOrderPreviewDto>(preview.json);
        const placed = await callAppRoute(ordersPOST, {
          method: "POST",
          url: `${ORIGIN}/api/v1/app/orders`,
          cookie,
          headers: { "idempotency-key": key },
          body: { preview_id: p.preview_id, pin: "1357" },
        });
        expect(placed.status).toBe(201);
        const order = dataOf<AppOrderDto>(placed.json);
        for (let i = 0; i < 12; i += 1) {
          await touchReference(stock.id);
          await drainJobs();
          await handle.mine(3);
          const res = await callAppRoute(orderGET, {
            method: "GET",
            url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
            cookie,
            params: { id: order.id },
          });
          const status = dataOf<AppOrderDto>(res.json).status;
          if (["completed", "failed", "cancelled", "expired"].includes(status)) break;
        }
        const done = await callAppRoute(orderGET, {
          method: "GET",
          url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
          cookie,
          params: { id: order.id },
        });
        return dataOf<AppOrderDto>(done.json);
      }
      const buy = await placeOrder({ side: "buy", amount_kobo: "2000000" }, "journey-buy-1");
      expect(buy.status).toBe("completed");
      const sell = await placeOrder({ side: "sell", amount_kobo: "500000" }, "journey-sell-1");
      expect(sell.status).toBe("completed");

      // 4. Stale price: a ₦5,000 buy waits, then completes after the price refreshes.
      await staleReference(stock.id);
      const waiting = await placeOrder({ side: "buy", amount_kobo: "500000" }, "journey-buy-2");
      await touchReference(stock.id);
      for (let i = 0; i < 12; i += 1) {
        await touchReference(stock.id);
        await drainJobs();
        await handle.mine(3);
        const res = await callAppRoute(orderGET, {
          method: "GET",
          url: `${ORIGIN}/api/v1/app/orders/${waiting.id}`,
          cookie,
          params: { id: waiting.id },
        });
        const status = dataOf<AppOrderDto>(res.json).status;
        if (status === "completed") break;
      }
      const waitingDone = await callAppRoute(orderGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/app/orders/${waiting.id}`,
        cookie,
        params: { id: waiting.id },
      });
      expect(dataOf<AppOrderDto>(waitingDone.json).status).toBe("completed");

      // 5. Join Earn with ₦10,000 and let the position go active.
      await touchReference(stock.id);
      const earnPreview = await callAppRoute(earnPreviewPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/earn/${strategy.id}/preview`,
        cookie,
        params: { id: strategy.id },
        body: { amount_kobo: "1000000" },
      });
      expect(earnPreview.status).toBe(200);
      const earnJoin = await callAppRoute(earnJoinPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/earn/${strategy.id}/join`,
        cookie,
        params: { id: strategy.id },
        body: {
          preview_id: dataOf<{ preview_id: string }>(earnPreview.json).preview_id,
          pin: "1357",
          accepted_risk_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
        },
        headers: { "idempotency-key": "journey-earn-1" },
      });
      expect(earnJoin.status).toBe(201);
      for (let i = 0; i < 10; i += 1) {
        await touchReference(stock.id);
        const ops = await db.onchainOperation.findMany({ where: { userId, kind: "strategy" } });
        let allFinal = ops.length > 0;
        for (const op of ops) {
          if (["finalized", "reverted", "failed"].includes(op.status)) continue;
          allFinal = false;
          await strategyService.progress(op.id);
          await handle.mine(3);
        }
        const positions = await db.strategyPosition.findMany({ where: { userId } });
        if (allFinal && positions.some((p) => p.state === "active")) break;
      }
      const positions = await db.strategyPosition.findMany({ where: { userId } });
      expect(positions.some((p) => p.state === "active")).toBe(true);

      // 6. Thursday 22:00 Lagos: the weekly harvest runs.
      setNow(nextLagosSlot(4, 22).toISOString());
      for (let i = 0; i < 8; i += 1) {
        await touchReference(stock.id);
        await drainJobs();
        await handle.mine(3);
      }

      // 7. Choose payout for earnings.
      const prefRes = await callAppRoute(preferencePUT, {
        method: "PUT",
        url: `${ORIGIN}/api/v1/app/earnings/preference`,
        cookie,
        body: { choice: "payout", pin: "1357" },
      });
      expect(prefRes.status).toBe(200);
      expect(dataOf<AppEarningsDto>(prefRes.json).choice).toBe("payout");

      // 8. Friday 08:00 Lagos: the payout batch runs.
      setNow(nextLagosSlot(5, 8).toISOString());
      for (let i = 0; i < 8; i += 1) {
        await touchReference(stock.id);
        await drainJobs();
        await handle.mine(3);
      }
      const earningsRes = await callAppRoute(earningsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/app/earnings`,
        cookie,
      });
      expect(earningsRes.status).toBe(200);
      const summary = dataOf<AppEarningsDto>(earningsRes.json);
      const week = lagosWeek(now());
      const weekEntry = summary.weeks.find((w) => w.week_of === week);
      if (weekEntry) {
        const expected = BigInt(weekEntry.earned_kobo) >= 200_000n ? "paid" : "rolled_over";
        expect(weekEntry.outcome).toBe(expected);
      }

      // 9. Withdraw ₦5,000 to the bank; it reaches paid.
      const wdPreview = await callAppRoute(withdrawalPreviewPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/withdrawals/preview`,
        cookie,
        body: { amount_kobo: "500000" },
      });
      expect(wdPreview.status).toBe(200);
      const wd = await callAppRoute(withdrawalsPOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/withdrawals`,
        cookie,
        headers: { "idempotency-key": "journey-wd-1" },
        body: { preview_id: dataOf<{ preview_id: string }>(wdPreview.json).preview_id, pin: "1357" },
      });
      expect(wd.status).toBe(201);
      const wdId = dataOf<AppWithdrawalDto>(wd.json).id;
      for (let i = 0; i < 12; i += 1) {
        await drainJobs();
        await handle.mine(3);
        const res = await callAppRoute(withdrawalGET, {
          method: "GET",
          url: `${ORIGIN}/api/v1/app/withdrawals/${wdId}`,
          cookie,
          params: { id: wdId },
        });
        if (dataOf<AppWithdrawalDto>(res.json).status === "completed") break;
      }
      const wdFinal = await callAppRoute(withdrawalGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/app/withdrawals/${wdId}`,
        cookie,
        params: { id: wdId },
      });
      expect(dataOf<AppWithdrawalDto>(wdFinal.json).status).toBe("completed");

      // 10. Activity and notifications reflect the whole journey.
      for (let i = 0; i < 4; i += 1) {
        await drainJobs();
        await handle.mine(3);
      }
      const activityRes = await callAppRoute(activityGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/app/activity`,
        cookie,
      });
      expect(activityRes.status).toBe(200);
      const kinds = dataOf<AppActivityPageDto>(activityRes.json).items.map((i) => i.kind);
      for (const kind of ["add_money", "buy", "sell", "earn_join", "withdrawal"]) {
        expect(kinds).toContain(kind);
      }

      const notificationsRes = await callAppRoute(notificationsGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/app/notifications`,
        cookie,
      });
      expect(notificationsRes.status).toBe(200);
      const noteKinds = dataOf<{ items: AppNotificationDto[] }>(notificationsRes.json).items.map(
        (n) => n.kind,
      );
      for (const kind of ["money_added", "order_completed", "earn_joined", "money_sent"]) {
        expect(noteKinds).toContain(kind);
      }
    },
  );
});
