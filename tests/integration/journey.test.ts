import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeStock, seedFloat, seedTreasury } from "../helpers/factories";
import {
  JOURNEY_PHONE,
  stepBankAccount,
  stepDeposit,
  stepDepositStatus,
  stepEarnings,
  stepIdentityToken,
  stepPortfolio,
  stepPreference,
  stepQuote,
  stepScenario,
  stepSession,
  stepVerification,
  stepWithdrawal,
  stepWithdrawalStatus,
} from "../helpers/journey";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

beforeEach(async () => {
  setNow("2026-11-12T20:00:00Z"); // Thursday 21:00 Lagos
  await seedTreasury("base", 1_000_000_000_000n);
  await seedFloat("yellowcard", 10_000_000_000n);
});

describe("beta journey", () => {
  it("walks identity to a paid withdrawal and the Friday earnings batch through the routes", async () => {
    const identityToken = await stepIdentityToken(JOURNEY_PHONE);
    const { token } = await stepSession(identityToken);
    await drainJobs();
    await stepVerification(token);
    await stepBankAccount(token);

    const stock = await makeStock();
    const depositId = await stepDeposit(token, stock.id, "2000000");
    expect((await stepDepositStatus(token, depositId)).status).toBe("awaiting_transfer");

    await stepScenario(token, depositId, "deposit_paid");
    expect(await db.ledgerJournal.count({ where: { orderId: depositId } })).toBe(0);
    await drainJobs();
    const deposit = await stepDepositStatus(token, depositId);
    expect(deposit.status).toBe("settled");
    expect(deposit.trade?.status).toBe("filled");

    const portfolio = await stepPortfolio(token);
    const holding = portfolio.holdings.find((h) => h.symbol === "TSTA");
    expect(holding).toBeTruthy();
    expect(BigInt(holding!.quantity)).toBeGreaterThan(0n);
    expect(holding!.value_ngn).not.toBeNull();
    expect(portfolio.valuation).toBe("ok");

    const quoteId = await stepQuote(token, "500000", stock.id);
    const withdrawalId = await stepWithdrawal(token, quoteId);
    await drainJobs();
    const withdrawal = await stepWithdrawalStatus(token, withdrawalId);
    expect(withdrawal.status).toBe("paid");
    expect(withdrawal.bank_reference).toBeTruthy();

    setNow("2026-11-12T21:00:00Z"); // Thursday 22:00 Lagos: harvest
    await drainJobs();
    const weeks = await stepEarnings(token);
    expect(weeks.length).toBeGreaterThan(0);
    const week = weeks[0]!;
    expect(BigInt(week.earned_usdc)).toBeGreaterThan(0n);
    expect(week.status).toBe("pending");

    await stepPreference(token, "payout");
    setNow("2026-11-13T07:00:00Z"); // Friday 08:00 Lagos: payout batch
    await drainJobs();
    const after = await stepEarnings(token);
    const batched = after.find((w) => w.week === week.week)!;
    expect(["paid", "pending"]).toContain(batched.status);
    expect(batched.status).not.toBe("paid_rollover");
  });
});
