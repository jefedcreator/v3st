import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { controlsService } from "@/backend/services/controls";
import {
  assertBetaRuntime,
  BetaPolicyError,
  integrationModes,
} from "@/backend/integrations/beta-policy";

import { useTestDatabase } from "../helpers/db";
import { makeStock, seedFloat, seedTreasury } from "../helpers/factories";
import {
  JOURNEY_PHONE,
  stepBankAccount,
  stepDeposit,
  stepDepositStatus,
  stepEarnings,
  stepIdentityToken,
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

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  setNow("2026-11-12T20:00:00Z"); // Thursday 21:00 Lagos
  fetchSpy = vi.fn(() =>
    Promise.reject(new Error("Live network access is disabled in tests")),
  );
  vi.stubGlobal("fetch", fetchSpy);
  await seedTreasury("base", 1_000_000_000_000n);
  await seedFloat("yellowcard", 10_000_000_000n);
});

async function runFullScenarioSuite(): Promise<void> {
  const identityToken = await stepIdentityToken(JOURNEY_PHONE);
  const { token } = await stepSession(identityToken);
  await drainJobs();
  await stepVerification(token);
  await stepBankAccount(token);

  const stock = await makeStock();
  const depositId = await stepDeposit(token, stock.id, "2000000");
  await stepScenario(token, depositId, "deposit_paid");
  await drainJobs();
  expect((await stepDepositStatus(token, depositId)).status).toBe("settled");

  const quoteId = await stepQuote(token, "500000", stock.id);
  const withdrawalId = await stepWithdrawal(token, quoteId);
  await drainJobs();
  expect((await stepWithdrawalStatus(token, withdrawalId)).status).toBe("paid");

  const rejectedQuoteId = await stepQuote(token, "500000", stock.id);
  const rejectedId = await stepWithdrawal(token, rejectedQuoteId);
  await stepScenario(token, rejectedId, "payout_rejected");
  await drainJobs();
  expect((await stepWithdrawalStatus(token, rejectedId)).status).toBe("reversed");

  setNow("2026-11-12T21:00:00Z"); // Thursday 22:00 Lagos: harvest
  await drainJobs();
  await stepPreference(token, "payout");
  setNow("2026-11-13T07:00:00Z"); // Friday 08:00 Lagos: payout batch
  await drainJobs();
  const weeks = await stepEarnings(token);
  expect(weeks.length).toBeGreaterThan(0);

  await controlsService.set(db, {
    scope: "provider:yellowcard",
    paused: true,
    reason: "containment: exercise paycrest failover",
    actorId: null,
  });
  const pcDepositId = await stepDeposit(token, stock.id, "2000000");
  const pcOrder = await db.rampOrder.findUniqueOrThrow({ where: { id: pcDepositId } });
  expect(pcOrder.provider).toBe("paycrest");
  await stepScenario(token, pcDepositId, "deposit_paid");
  await drainJobs();
  expect((await stepDepositStatus(token, pcDepositId)).status).toBe("settled");
}

describe("beta containment", () => {
  it("runs every flow without a live network request or a non-beta mode", async () => {
    await runFullScenarioSuite();
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const table of [
      "rampOrder",
      "chainTransfer",
      "tradeOrder",
      "bankAccount",
      "treasuryOperation",
      "webhookEvent",
    ] as const) {
      expect(
        await (db[table] as unknown as {
          count: (args: unknown) => Promise<number>;
        }).count({ where: { providerMode: { notIn: ["sandbox", "simulated"] } } }),
      ).toBe(0);
    }
    expect(
      Object.values(integrationModes()).every((m) => m === "simulated" || m === "sandbox"),
    ).toBe(true);
  });

  it("refuses to start the worker outside beta", () => {
    expect(() => assertBetaRuntime({ APP_STAGE: "prod" })).toThrow(BetaPolicyError);
  });
});
