import { beforeEach, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { ProviderError } from "@/backend/services/ramp/errors";
import { createSimulatedRampProvider } from "@/backend/services/ramp/simulated";
import type {
  BankDestination,
  Customer,
} from "@/backend/services/ramp/types";
import { simRamp } from "@/backend/services/simulator/ramp";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { setNow } from "../helpers/time";

useTestDatabase();

const yc = () => createSimulatedRampProvider("yellowcard");

const customer: Customer = {
  userId: "u1",
  name: "ADAEZE OBI",
  phone: "+23400000000001",
  country: "NG",
  dateOfBirth: null,
  idType: "BVN",
  idNumber: null,
  address: null,
};

const source: BankDestination = {
  bankCode: "sim-bank-a",
  accountNumber: "0123456789",
  accountName: "ADAEZE OBI",
};

async function makeCollection(key = "dep-1") {
  const p = yc();
  const quote = await p.quote("in", 2_000_000n);
  return p.createCollection({ quote, customer, source, key, recipient: null });
}

async function payoutInput(key = "w1") {
  const p = yc();
  const quote = await p.quote("out", 500_000n);
  return {
    quote,
    destination: { bankCode: "sim-bank-a", accountNumber: "0123456789", accountName: "ADAEZE OBI" },
    customer,
    key,
    maxUsd: 10_000_000n,
  };
}

beforeEach(() => {
  simRamp.rateOverride.buy = undefined;
  simRamp.rateOverride.sell = undefined;
});

it("quotes a ₦20,000 deposit with the published fee and buy rate", async () => {
  expect(await yc().quote("in", 2_000_000n)).toMatchObject({
    feeNgn: 20_000n,
    usdAmount: 12_375_000n,
    rate: { kobo: 4n, microUsd: 25n },
  });
});

it("quotes a ₦5,000 payout with the flat ₦100 fee", async () => {
  expect(await yc().quote("out", 500_000n)).toMatchObject({
    feeNgn: 10_000n,
    usdAmount: 3_225_807n,
  });
});

it("rejects a duplicate collection key and finds the original by key", async () => {
  setNow("2026-11-13T07:00:00Z");
  const first = await makeCollection("dep-dup");
  await expect(makeCollection("dep-dup")).rejects.toMatchObject({ kind: "duplicate" });
  const found = await yc().findByKey("in", "dep-dup");
  expect(found?.ref).toBe(first.ref);
});

it("expires an unpaid collection after 240 minutes", async () => {
  setNow("2026-11-13T07:00:00Z");
  const col = await makeCollection("dep-exp");
  setNow("2026-11-13T11:01:00Z"); // +241 minutes
  const tx = await yc().getTransaction("in", col.ref);
  expect(tx.state).toBe("expired");
});

it("reports a paid collection with its sender and amount", async () => {
  setNow("2026-11-13T07:00:00Z");
  const col = await makeCollection("dep-paid");
  await simRamp.markCollectionPaid("yellowcard", "dep-paid", {
    ngnAmount: 2_000_000n,
    senderName: "ADAEZE OBI",
  });
  const tx = await yc().getTransaction("in", col.ref);
  expect(tx).toMatchObject({
    state: "complete",
    senderName: "ADAEZE OBI",
    ngnAmount: 2_000_000n,
  });
});

it("fails payouts to 0000000000 after the settlement delay", async () => {
  setNow("2026-11-13T07:00:00Z");
  const input = await payoutInput("w-bad");
  const result = await yc().createPayout({
    ...input,
    destination: { bankCode: "sim-bank-a", accountNumber: "0000000000", accountName: "ADAEZE OBI" },
  });
  const before = await yc().getTransaction("out", result.ref);
  expect(before.state).toBe("pending");
  setNow("2026-11-13T07:00:06Z"); // +6 s > settleSeconds
  const after = await yc().getTransaction("out", result.ref);
  expect(after.state).toBe("failed");
});

it("refuses to lock a payout above maxUsd and writes nothing", async () => {
  setNow("2026-11-13T07:00:00Z");
  const input = await payoutInput("w-move");
  simRamp.rateOverride.sell = "1500";
  await expect(
    yc().createPayout({ ...input, maxUsd: 3_225_807n }),
  ).rejects.toMatchObject({ kind: "rate_moved" });
  expect(await db.simRampTx.count({ where: { kind: "payout" } })).toBe(0);
});

it("resolves known simulated bank accounts and rejects unknown ones", async () => {
  expect(await yc().resolveBankAccount("sim-bank-a", "0123456789")).toBe("ADAEZE OBI");
  await expect(yc().resolveBankAccount("sim-bank-a", "9999999999")).rejects.toBeInstanceOf(
    ProviderError,
  );
  await expect(yc().resolveBankAccount("sim-bank-a", "9999999999")).rejects.toMatchObject({
    code: "ACCOUNT_NOT_FOUND",
  });
});

it("computes the float from seeds, collections and payouts", async () => {
  setNow("2026-11-13T07:00:00Z");
  await simRamp.seedFloat("yellowcard", 100_000_000n);
  await makeCollection("dep-f1");
  await simRamp.markCollectionPaid("yellowcard", "dep-f1", {
    ngnAmount: 2_000_000n,
    senderName: "ADAEZE OBI",
  });
  const input = await payoutInput("w-f1");
  const payout = await yc().createPayout(input);
  setNow("2026-11-13T07:00:06Z");
  await yc().getTransaction("out", payout.ref);
  expect(await yc().floatBalance()).toBe(100_000_000n + 12_375_000n - 3_225_807n);
  expect(await simRamp.floatBalance("yellowcard")).toBe(100_000_000n + 12_375_000n - 3_225_807n);
  expect(now()).toBeInstanceOf(Date);
});
