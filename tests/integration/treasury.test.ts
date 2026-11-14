import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { register, rampRegistry, reset } from "@/backend/services/ramp";
import { capacityService } from "@/backend/services/treasury/capacity";
import { treasuryService } from "@/backend/services/treasury";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { seedFloat, seedTreasury } from "../helpers/factories";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

describe("treasury", () => {
  it("counts open payouts against float capacity", async () => {
    await seedFloat("yellowcard", 100_000_000n);
    const u = await db.user.create({
      data: {
        phone: "+2340000000777",
        identitySubject: "sim-cap-1",
        identityMode: "simulated",
      },
    });
    await db.rampOrder.create({
      data: {
        userId: u.id,
        kind: "withdrawal",
        direction: "out",
        provider: "yellowcard",
        providerMode: "simulated",
        settlementModel: "partner_float",
        status: "created",
        idempotencyKey: "cap-1",
        requestHash: "test",
        ngnAmount: 500_000n,
        usdAmount: 30_000_000n,
      },
    });
    expect(await capacityService.floatAvailable("yellowcard")).toBe(70_000_000n);
  });

  it("tops up a float below its floor and posts on provider confirmation", async () => {
    setNow("2026-11-13T09:30:00Z");
    await seedTreasury("base", 50_000_000_000n);
    await seedFloat("yellowcard", 1_000_000_000n);
    const ops = await treasuryService.rebalance(now());
    expect(ops).toHaveLength(1);
    await drainJobs();
    expect(await db.treasuryOperation.findUniqueOrThrow({ where: { id: ops[0]!.id } })).toMatchObject({
      kind: "float_topup",
      status: "complete",
      amountUsd: 9_000_000_000n,
    });
    expect(await ledgerService.balance(acct.float("yellowcard"))).toBe(10_000_000_000n);
    expect(await ledgerService.balance(acct.treasury("base"))).toBe(41_000_000_000n);
  });

  it("withdraws excess float above the ceiling into the treasury", async () => {
    setNow("2026-11-13T09:30:00Z");
    await seedFloat("yellowcard", 25_000_000_000n);
    const ops = await treasuryService.rebalance(now());
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "float_withdrawal", amountUsd: 15_000_000_000n });
    await drainJobs();
    expect(
      await db.treasuryOperation.findUniqueOrThrow({ where: { id: ops[0]!.id } }),
    ).toMatchObject({ status: "complete" });
    expect(await ledgerService.balance(acct.treasury("base"))).toBe(15_000_000_000n);
  });

  it("keeps one active rebalance per provider under parallel runs", async () => {
    setNow("2026-11-13T09:30:00Z");
    await seedTreasury("base", 50_000_000_000n);
    await seedFloat("yellowcard", 1_000_000_000n);
    const results = await Promise.all([
      treasuryService.rebalance(now()),
      treasuryService.rebalance(now()),
    ]);
    const all = results.flat();
    expect(all).toHaveLength(1);
    expect(await db.treasuryOperation.count()).toBe(1);
  });

  it("alerts instead of acting while Yellow Card runs in sandbox", async () => {
    setNow("2026-11-13T09:30:00Z");
    const base = rampRegistry.get("yellowcard");
    register({
      ...base,
      mode: "sandbox",
      floatBalance: () => Promise.resolve(30_000_000_000n),
    });
    try {
      const ops = await treasuryService.rebalance(now());
      expect(ops).toEqual([]);
      expect(
        await db.operationalAlert.count({
          where: {
            kind: "treasury.manual_rebalance_required",
            resolvedAt: null,
          },
        }),
      ).toBe(1);
      expect(await db.treasuryOperation.count()).toBe(0);
    } finally {
      reset();
      register(base);
    }
  });

  it("tops up exactly the shortfall plus margin for a known requirement", async () => {
    setNow("2026-11-13T09:30:00Z");
    await seedTreasury("base", 50_000_000_000n);
    await seedFloat("yellowcard", 10_000_000_000n);
    const op = await treasuryService.ensureFloat("yellowcard", 12_000_000_000n);
    expect(op).toMatchObject({ kind: "float_topup", amountUsd: 3_000_000_000n });
    await drainJobs();
    expect(
      await db.treasuryOperation.findUniqueOrThrow({ where: { id: op!.id } }),
    ).toMatchObject({ status: "complete" });
  });
});
