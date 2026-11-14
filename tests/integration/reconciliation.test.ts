import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { controlsService } from "@/backend/services/controls";
import { reconciliationService } from "@/backend/services/reconciliation";
import { depositService } from "@/backend/services/deposits";
import { register, rampRegistry, reset } from "@/backend/services/ramp";
import { simRamp } from "@/backend/services/simulator/ramp";
import { treasuryService } from "@/backend/services/treasury";
import { walletService } from "@/backend/services/wallets";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeBankAccount, makeVerifiedUser } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

describe("reconciliation", () => {
  it("passes when ledger and external balances agree", async () => {
    setNow("2026-11-13T09:00:00Z");
    await treasuryService.seedOpeningBalances({
      treasuryMicroUsdc: { base: 10_000_000_000n, solana: 5_000_000_000n },
      floatMicroUsd: 100_000_000_000n,
    });
    const run = await reconciliationService.run(now());
    expect(run.status).toBe("balanced");
    const results = run.results as unknown as { check: string; status: string }[];
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.status).toBe("ok");
    }
  });

  it("pauses payouts once on an unexplained breach", async () => {
    setNow("2026-11-13T09:00:00Z");
    await treasuryService.seedOpeningBalances({
      treasuryMicroUsdc: { base: 10_000_000_000n, solana: 5_000_000_000n },
      floatMicroUsd: 100_000_000_000n,
    });
    await simRamp.seedFloat("yellowcard", 5_000_000n);
    const r1 = await reconciliationService.run(now());
    const r2 = await reconciliationService.run(now());
    expect([r1.status, r2.status]).toEqual(["breached", "breached"]);
    expect(await controlsService.isPaused("payouts")).toBe(true);
    expect(
      await db.operationalAlert.count({ where: { kind: "recon.breach", resolvedAt: null } }),
    ).toBe(1);
  });

  it("treats an unprocessed completed deposit as timing, not a breach", async () => {
    setNow("2026-11-13T09:00:00Z");
    await treasuryService.seedOpeningBalances({
      treasuryMicroUsdc: { base: 50_000_000_000n, solana: 5_000_000_000n },
      floatMicroUsd: 100_000_000_000n,
    });
    const ada = await makeVerifiedUser("ada_tier2");
    await makeBankAccount(ada.id);
    await walletService.ensureUserWallets(ada.id);
    const { deposit } = await depositService.create(ada.id, { ngn_amount: 2_000_000n }, "recon-1");
    await simRamp.markCollectionPaid("yellowcard", deposit.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    const run = await reconciliationService.run(now());
    expect(run.status).toBe("balanced");
  });

  it("reports incomplete and holds payouts when a balance read fails", async () => {
    setNow("2026-11-13T09:00:00Z");
    await treasuryService.seedOpeningBalances({
      treasuryMicroUsdc: { base: 10_000_000_000n, solana: 5_000_000_000n },
      floatMicroUsd: 100_000_000_000n,
    });
    const base = rampRegistry.get("yellowcard");
    register({
      ...base,
      floatBalance: () => {
        throw new Error("provider down");
      },
    });
    try {
      const run = await reconciliationService.run(now());
      expect(run.status).toBe("incomplete");
      const results = run.results as unknown as { check: string; status: string; observed: string | null }[];
      const floatCheck = results.find((r) => r.check === "float:yellowcard");
      expect(floatCheck).toMatchObject({ status: "unavailable", observed: null });
      expect(await controlsService.isPaused("payouts")).toBe(true);
    } finally {
      reset();
      register(base);
    }
  });
});
