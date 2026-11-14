import { env } from "@/env";
import { Prisma, PrismaClient } from "../../generated/prisma";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;
export type DbClient = typeof db | Tx;

export async function withTx<T>(
  fn: (tx: Tx) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  return db.$transaction(async (tx) => fn(tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: opts?.timeoutMs ?? 10_000,
  });
}

type LockableTable =
  | "users"
  | "ramp_orders"
  | "ledger_accounts"
  | "trade_orders"
  | "chain_transfers"
  | "onchain_operations"
  | "investment_authorizations"
  | "investment_quotes"
  | "investments"
  | "strategy_quotes"
  | "strategy_positions"
  | "sponsor_budgets";

export async function lockRows(
  tx: Tx,
  table: LockableTable,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx.$executeRawUnsafe(
    `SELECT id FROM "${table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
    ids,
  );
}
