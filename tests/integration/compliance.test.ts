import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { complianceService } from "@/backend/services/compliance";
import type { Tx } from "@/server/db";
import { withTx } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeUser, makeVerifiedUser } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

function insertOrderRow(
  tx: Tx,
  input: { userId: string; ngnAmount: bigint; idempotencyKey: string },
) {
  return tx.rampOrder.create({
    data: {
      userId: input.userId,
      kind: "deposit",
      direction: "in",
      provider: "yellowcard",
      providerMode: "simulated",
      settlementModel: "partner_float",
      status: "created",
      idempotencyKey: input.idempotencyKey,
      requestHash: "test",
      ngnAmount: input.ngnAmount,
      createdAt: now(),
    },
  });
}

describe("compliance", () => {
  it("requires verified KYC", async () => {
    const u = await makeUser();
    await expect(
      withTx((tx) =>
        complianceService.assertCanTransact(tx, {
          userId: u.id,
          direction: "in",
          ngnAmount: 1_000n,
          usdAmount: 1n,
          at: now(),
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "KYC_REQUIRED" });
  });

  it("enforces the tier-1 daily limit across concurrent orders", async () => {
    setNow("2026-11-13T09:00:00Z");
    const u = await makeVerifiedUser("tunde_tier1");
    const attempt = (k: string) =>
      withTx(async (tx) => {
        await complianceService.assertCanTransact(tx, {
          userId: u.id,
          direction: "in",
          ngnAmount: 20_000_000n,
          usdAmount: 1n,
          at: now(),
        });
        await insertOrderRow(tx, { userId: u.id, ngnAmount: 20_000_000n, idempotencyKey: k });
      });
    const results = await Promise.allSettled([attempt("a"), attempt("b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "LIMIT_EXCEEDED" },
    });
  });

  it("resets the daily limit at Lagos midnight", async () => {
    setNow("2026-11-12T22:30:00Z");
    const u = await makeVerifiedUser("tunde_tier1");
    await withTx(async (tx) => {
      await complianceService.assertCanTransact(tx, {
        userId: u.id,
        direction: "in",
        ngnAmount: 30_000_000n,
        usdAmount: 1n,
        at: now(),
      });
      await insertOrderRow(tx, {
        userId: u.id,
        ngnAmount: 30_000_000n,
        idempotencyKey: "day1",
      });
    });
    setNow("2026-11-12T23:30:00Z");
    await expect(
      withTx((tx) =>
        complianceService.assertCanTransact(tx, {
          userId: u.id,
          direction: "in",
          ngnAmount: 1_000n,
          usdAmount: 1n,
          at: now(),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("requires travel-rule data at exactly one thousand dollars", async () => {
    const u = await makeVerifiedUser("tunde_tier1");
    await expect(
      withTx((tx) =>
        complianceService.assertCanTransact(tx, {
          userId: u.id,
          direction: "out",
          ngnAmount: 1_000n,
          usdAmount: 999_999_999n,
          at: now(),
        }),
      ),
    ).resolves.toBeDefined();
    await expect(
      withTx((tx) =>
        complianceService.assertCanTransact(tx, {
          userId: u.id,
          direction: "out",
          ngnAmount: 1_000n,
          usdAmount: 1_000_000_000n,
          at: now(),
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "TRAVEL_RULE_DATA_MISSING" });
  });

  it("passes travel-rule checks for a complete tier-2 profile", async () => {
    const u = await makeVerifiedUser("ada_tier2");
    await expect(
      withTx((tx) =>
        complianceService.assertCanTransact(tx, {
          userId: u.id,
          direction: "out",
          ngnAmount: 400_000_000n,
          usdAmount: 1_000_000_000n,
          at: now(),
        }),
      ),
    ).resolves.toMatchObject({ userId: u.id, name: "ADAEZE OBI" });
  });
});
