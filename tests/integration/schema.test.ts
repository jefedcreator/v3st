import { randomUUID } from "node:crypto";

import { expect, it } from "vitest";

import { Prisma } from "@/server/prisma";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";

useTestDatabase();

async function makeAccount(code: string, asset: string) {
  const data: Prisma.LedgerAccountCreateInput = {
    code,
    asset,
    ownerType: "external",
    allowNegative: true,
  };
  return db.ledgerAccount.create({ data });
}

async function insertEntry(input: {
  debit: string;
  credit: string;
  asset: string;
  amount: bigint;
}) {
  const journalData: Prisma.LedgerJournalCreateInput = {
    key: `test-${randomUUID()}`,
    kind: "test",
    requestHash: "test",
  };
  const journal = await db.ledgerJournal.create({ data: journalData });
  const debit = await db.ledgerAccount.findUniqueOrThrow({
    where: { code: input.debit },
  });
  const credit = await db.ledgerAccount.findUniqueOrThrow({
    where: { code: input.credit },
  });
  const data: Prisma.LedgerEntryCreateInput = {
    journalId: journal.id,
    debitAccountId: debit.id,
    creditAccountId: credit.id,
    asset: input.asset,
    amount: input.amount,
  };
  return db.ledgerEntry.create({ data });
}

async function insertValidEntry() {
  await makeAccount("valid-a", "USDC");
  await makeAccount("valid-b", "USDC");
  return insertEntry({ debit: "valid-a", credit: "valid-b", asset: "USDC", amount: 1n });
}

async function makeUserRow() {
  const suffix = randomUUID().slice(0, 8);
  const data: Prisma.UserCreateInput = {
    phone: `+2340000${suffix.padEnd(3, "0").slice(0, 11)}`,
    identitySubject: `sim-${suffix}`,
    identityMode: "simulated",
  };
  return db.user.create({ data });
}

async function insertBankAccount(userId: string, status: "active" | "replaced" | "rejected") {
  const data: Prisma.BankAccountCreateInput = {
    userId,
    bankCode: "044",
    bankName: "Test Bank",
    accountNumber: `01${randomUUID().slice(0, 8)}`,
    resolvedName: "Test User",
    nameMatch: true,
    status,
    provider: "yellowcard",
    providerMode: "simulated",
  };
  return db.bankAccount.create({ data });
}

async function insertWebhookEvent(provider: "yellowcard" | "paycrest", eventKey: string) {
  const data: Prisma.WebhookEventCreateInput = {
    provider,
    eventKey,
    payload: {},
    signatureValid: true,
    providerMode: "simulated",
  };
  return db.webhookEvent.create({ data });
}

async function insertAlert(dedupeKey: string) {
  const data: Prisma.OperationalAlertCreateInput = {
    kind: "recon.breach",
    severity: "critical",
    dedupeKey,
    message: "test alert",
    context: {},
  };
  return db.operationalAlert.create({ data });
}

async function insertTreasuryOp(provider: "yellowcard" | "paycrest", status: Prisma.TreasuryOperationCreateInput["status"]) {
  const data: Prisma.TreasuryOperationCreateInput = {
    key: `top-${randomUUID()}`,
    kind: "float_topup",
    provider,
    chain: "base",
    amountUsd: 1_000_000n,
    status,
    providerMode: "simulated",
  };
  return db.treasuryOperation.create({ data });
}

it("rejects an entry between accounts holding different assets", async () => {
  const usd = await makeAccount("a", "USD");
  const usdc = await makeAccount("b", "USDC");
  await expect(
    insertEntry({ debit: usd.code, credit: usdc.code, asset: "USD", amount: 1n }),
  ).rejects.toThrow(/asset mismatch/);
});

it("rejects non-positive amounts and self-transfers", async () => {
  const a = await makeAccount("c", "USDC");
  const b = await makeAccount("d", "USDC");
  await expect(
    insertEntry({ debit: a.code, credit: b.code, asset: "USDC", amount: 0n }),
  ).rejects.toThrow();
  await expect(
    insertEntry({ debit: a.code, credit: a.code, asset: "USDC", amount: 1n }),
  ).rejects.toThrow();
});

it("keeps journals and entries append-only", async () => {
  const entry = await insertValidEntry();
  await expect(
    db.ledgerEntry.update({ where: { id: entry.id }, data: { amount: 2n } }),
  ).rejects.toThrow(/append-only/);
  await expect(db.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(
    /append-only/,
  );
  await expect(
    db.ledgerJournal.delete({ where: { id: entry.journalId } }),
  ).rejects.toThrow(/append-only/);
});

it("allows one active bank account per user", async () => {
  const user = await makeUserRow();
  await insertBankAccount(user.id, "active");
  await expect(insertBankAccount(user.id, "active")).rejects.toThrow();
  await expect(insertBankAccount(user.id, "replaced")).resolves.toBeDefined();
});

it("dedupes webhook events per provider only", async () => {
  await insertWebhookEvent("yellowcard", "e1");
  await expect(insertWebhookEvent("yellowcard", "e1")).rejects.toThrow();
  await expect(insertWebhookEvent("paycrest", "e1")).resolves.toBeDefined();
});

it("allows a repeated alert dedupe key only after resolution", async () => {
  const first = await insertAlert("recon.breach:float:yellowcard");
  await expect(insertAlert("recon.breach:float:yellowcard")).rejects.toThrow();
  await db.operationalAlert.update({
    where: { id: first.id },
    data: { resolvedAt: new Date() },
  });
  await expect(insertAlert("recon.breach:float:yellowcard")).resolves.toBeDefined();
});

it("allows one active treasury operation per provider", async () => {
  await insertTreasuryOp("yellowcard", "planned");
  await expect(insertTreasuryOp("yellowcard", "awaiting_provider")).rejects.toThrow();
});
