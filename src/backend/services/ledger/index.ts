import { type Prisma } from "@/server/prisma";
import { type DbClient, db, lockRows, type Tx } from "@/server/db";
import { canonicalJson, newCuid, sha256Hex } from "@/utils";
import { BadRequestException, ConflictException } from "@/utils/exceptions";

import type { AccountSpec } from "./accounts";
import type { JournalInput } from "./postings";

async function balanceById(client: DbClient, accountId: string): Promise<bigint> {
  const rows = await client.$queryRaw<Array<{ balance: string }>>`
    SELECT COALESCE(
      SUM(CASE WHEN "creditAccountId" = ${accountId} THEN "amount" ELSE 0 END)
      - SUM(CASE WHEN "debitAccountId" = ${accountId} THEN "amount" ELSE 0 END),
      0
    )::text AS balance
    FROM "ledger_entries"
    WHERE "debitAccountId" = ${accountId} OR "creditAccountId" = ${accountId}
  `;
  return BigInt(rows[0]?.balance ?? "0");
}

class LedgerService {
  async post(
    tx: Tx,
    journal: JournalInput,
  ): Promise<{ journalId: string; created: boolean }> {
    const requestHash = sha256Hex(
      canonicalJson({
        kind: journal.kind,
        orderId: journal.orderId,
        entries: journal.entries.map((e) => [e.debit.code, e.credit.code, e.amount]),
      }),
    );

    const existing = await tx.ledgerJournal.findUnique({
      where: { key: journal.key },
    });
    if (existing) {
      if (existing.requestHash === requestHash) {
        return { journalId: existing.id, created: false };
      }
      throw new ConflictException(
        "Ledger journal key reused with different entries",
        "LEDGER_KEY_REUSED",
      );
    }

    for (const entry of journal.entries) {
      if (entry.debit.asset !== entry.credit.asset) {
        throw new BadRequestException("Ledger entry debit and credit assets differ");
      }
      if (entry.amount <= 0n) {
        throw new BadRequestException("Ledger entry amount must be positive");
      }
    }

    const specs = new Map<string, AccountSpec>();
    for (const entry of journal.entries) {
      specs.set(entry.debit.code, entry.debit);
      specs.set(entry.credit.code, entry.credit);
    }
    const accountIds = new Map<string, string>();
    for (const spec of specs.values()) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "ledger_accounts" (id, code, asset, "ownerType", "userId", "allowNegative")
         VALUES ($1, $2, $3, $4::"LedgerOwner", $5, $6)
         ON CONFLICT (code) DO NOTHING`,
        newCuid(),
        spec.code,
        spec.asset,
        spec.ownerType,
        spec.userId,
        spec.allowNegative,
      );
      const found = await tx.ledgerAccount.findUniqueOrThrow({
        where: { code: spec.code },
      });
      if (
        found.asset !== spec.asset ||
        found.ownerType !== spec.ownerType ||
        found.allowNegative !== spec.allowNegative
      ) {
        throw new BadRequestException(
          `Ledger account ${spec.code} already exists with a different spec`,
        );
      }
      accountIds.set(spec.code, found.id);
    }

    const lockedIds: string[] = [];
    for (const entry of journal.entries) {
      if (!entry.debit.allowNegative) {
        const id = accountIds.get(entry.debit.code);
        if (id !== undefined && !lockedIds.includes(id)) {
          lockedIds.push(id);
        }
      }
    }
    await lockRows(tx, "ledger_accounts", lockedIds);

    for (const entry of journal.entries) {
      if (entry.debit.allowNegative) continue;
      const id = accountIds.get(entry.debit.code);
      if (id === undefined) continue;
      const current = await balanceById(tx, id);
      let net = 0n;
      for (const e of journal.entries) {
        if (e.credit.code === entry.debit.code) net += e.amount;
        if (e.debit.code === entry.debit.code) net -= e.amount;
      }
      if (current + net < 0n) {
        throw new ConflictException("Insufficient funds", "INSUFFICIENT_FUNDS");
      }
    }

    const journalData: Prisma.LedgerJournalCreateInput = {
      key: journal.key,
      kind: journal.kind,
      orderId: journal.orderId,
      requestHash,
    };
    const created = await tx.ledgerJournal.create({ data: journalData });
    for (const entry of journal.entries) {
      const entryData: Prisma.LedgerEntryCreateInput = {
        journalId: created.id,
        debitAccountId: accountIds.get(entry.debit.code)!,
        creditAccountId: accountIds.get(entry.credit.code)!,
        asset: entry.debit.asset,
        amount: entry.amount,
      };
      await tx.ledgerEntry.create({ data: entryData });
    }
    return { journalId: created.id, created: true };
  }

  async balance(account: AccountSpec, client: DbClient = db): Promise<bigint> {
    const found = await client.ledgerAccount.findUnique({
      where: { code: account.code },
    });
    if (!found) return 0n;
    return balanceById(client, found.id);
  }

  async balancesForUser(userId: string): Promise<Map<string, bigint>> {
    const rows = await db.$queryRaw<Array<{ code: string; balance: string }>>`
      SELECT a.code AS code, COALESCE(
        SUM(CASE WHEN e."creditAccountId" = a.id THEN e."amount" ELSE 0 END)
        - SUM(CASE WHEN e."debitAccountId" = a.id THEN e."amount" ELSE 0 END),
        0
      )::text AS balance
      FROM "ledger_accounts" a
      LEFT JOIN "ledger_entries" e
        ON e."debitAccountId" = a.id OR e."creditAccountId" = a.id
      WHERE a."userId" = ${userId}
      GROUP BY a.code
    `;
    return new Map(rows.map((row) => [row.code, BigInt(row.balance)]));
  }
}

export const ledgerService = new LedgerService();
