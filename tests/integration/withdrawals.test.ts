import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
import { orderService } from "@/backend/services/orders";
import { simRamp } from "@/backend/services/simulator/ramp";
import { walletService } from "@/backend/services/wallets";
import { withdrawalService } from "@/backend/services/withdrawals";
import { controlsService } from "@/backend/services/controls";

import { useTestDatabase } from "../helpers/db";
import {
  fundCash,
  makeBankAccount,
  makeStock,
  makeVerifiedUser,
  seedFloat,
  seedTreasury,
} from "../helpers/factories";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

let ada: User;

beforeEach(async () => {
  setNow("2026-11-13T09:00:00Z");
  ada = await makeVerifiedUser("ada_tier2");
  await makeBankAccount(ada.id);
  await walletService.ensureUserWallets(ada.id);
  await seedFloat("yellowcard", 100_000_000_000n);
  await seedTreasury("base", 1_000_000_000_000n);
});

describe("withdrawals", () => {
  it("quotes gross, fee, net and debit for a N5,000 withdrawal", async () => {
    await fundCash(ada.id, 10_000_000n);
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    expect(q).toMatchObject({
      ngn_amount: "500000",
      fee_ngn: "10000",
      net_ngn: "490000",
      debit_usdc: "3225807",
      expires_at: "2026-11-13T09:01:00.000Z",
    });
  });

  it("lets only one of two concurrent withdrawals spend the same cash", async () => {
    await fundCash(ada.id, 10_000_000n);
    const [q1, q2] = await Promise.all([
      withdrawalService.quote(ada.id, { ngn_amount: 1_085_000n }),
      withdrawalService.quote(ada.id, { ngn_amount: 1_085_000n }),
    ]);
    const results = await Promise.allSettled([
      withdrawalService.confirm(ada.id, q1.id, "key-aaaa1"),
      withdrawalService.confirm(ada.id, q2.id, "key-bbbb2"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "INSUFFICIENT_FUNDS" },
    });
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(3_000_000n);
  });

  it("rejects expired and reused quotes", async () => {
    await fundCash(ada.id, 10_000_000n);
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    setNow("2026-11-13T09:01:01.000Z");
    await expect(withdrawalService.confirm(ada.id, q.id, "key-exp-1")).rejects.toMatchObject({
      code: "QUOTE_EXPIRED",
    });
    setNow("2026-11-13T09:00:30.000Z");
    await withdrawalService.confirm(ada.id, q.id, "key-ok-1");
    await expect(withdrawalService.confirm(ada.id, q.id, "key-ok-2")).rejects.toMatchObject({
      code: "QUOTE_CONSUMED",
    });
  });

  it("pays out end to end and records the bank reference", async () => {
    await fundCash(ada.id, 10_000_000n);
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "key-pay-1");
    await drainJobs();
    const dto = await withdrawalService.get(ada.id, withdrawal.id);
    expect(dto.status).toBe("paid");
    expect(dto.bank_reference).not.toBeNull();
    expect(await ledgerService.balance(acct.treasury("base"))).toBe(1_000_000_000_000n + 3_225_807n);
    expect(await ledgerService.balance(acct.float("yellowcard"))).toBe(100_000_000_000n - 3_225_807n);
  });

  it("does not resubmit a send after a crash following acceptance", async () => {
    await fundCash(ada.id, 10_000_000n);
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "key-crash-1");
    const spy = vi.spyOn(orderService, "transition").mockRejectedValueOnce(new Error("boom"));
    await drainJobs();
    spy.mockRestore();
    await drainJobs();
    const payouts = await db.simRampTx.count({
      where: { provider: "yellowcard", kind: "payout", key: withdrawal.id },
    });
    expect(payouts).toBe(1);
    expect((await withdrawalService.get(ada.id, withdrawal.id)).status).toBe("paid");
  });

  it("holds instead of sending when the locked rate moved past the cap", async () => {
    await fundCash(ada.id, 10_000_000n);
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "key-rate-1");
    simRamp.rateOverride.sell = "1500";
    try {
      await drainJobs();
      const dto = await withdrawalService.get(ada.id, withdrawal.id);
      expect(dto.status).toBe("funds_collected");
      expect(dto.hold_reason).toBe("rate_moved");
      expect(
        await db.simRampTx.count({
          where: { provider: "yellowcard", kind: "payout", key: withdrawal.id },
        }),
      ).toBe(0);
      expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(6_774_193n);
    } finally {
      simRamp.rateOverride.sell = undefined;
    }
  });

  it("reverses a bank rejection and restores cash only after the return confirms", async () => {
    await fundCash(ada.id, 10_000_000n);
    await makeBankAccount(ada.id, "0000000000");
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "key-rev-1");
    await drainJobs();
    let dto = await withdrawalService.get(ada.id, withdrawal.id);
    expect(dto.status).toBe("reversed");
    await withdrawalService.progress(withdrawal.id);
    dto = await withdrawalService.get(ada.id, withdrawal.id);
    expect(dto.return_status).toBe("pending");
    expect(await ledgerService.balance(acct.userPending(ada.id))).toBe(3_225_807n);
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(6_774_193n);
    await drainJobs();
    dto = await withdrawalService.get(ada.id, withdrawal.id);
    expect(dto.return_status).toBe("returned");
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(10_000_000n);
  });

  it("sells the chosen stock first and keeps surplus proceeds as cash", async () => {
    const s = await makeStock();
    await withTx((tx) =>
      ledgerService.post(
        tx,
        openingBalance({ account: acct.userStock(ada.id, s.id), amount: 5_000_000n }),
      ),
    );
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n, stock_id: s.id });
    expect(q.sell_quantity).not.toBeNull();
    const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "key-stk-1");
    await drainJobs();
    const dto = await withdrawalService.get(ada.id, withdrawal.id);
    expect(dto.status).toBe("paid");
    expect(dto.trade?.status).toBe("filled");
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(3_258_066n - 3_225_807n);
  });

  it("refuses new withdrawals while payouts are paused but finishes submitted ones", async () => {
    await fundCash(ada.id, 20_000_000n);
    const q1 = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    const { withdrawal } = await withdrawalService.confirm(ada.id, q1.id, "key-pau-1");
    await drainJobs();
    expect((await withdrawalService.get(ada.id, withdrawal.id)).status).toBe("paid");
    await controlsService.set(db, {
      scope: "payouts",
      paused: true,
      reason: "test pause",
      actorId: null,
    });
    await expect(
      withdrawalService.quote(ada.id, { ngn_amount: 500_000n }),
    ).rejects.toMatchObject({ code: "PAYOUTS_PAUSED" });
  });
});
