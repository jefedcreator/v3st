import { Prisma, type ProviderId, type SimRampTx } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { sha256Hex } from "@/utils";

export const SIM_BANKS = [
  { code: "sim-bank-a", name: "Beta Test Bank A (simulated)" },
  { code: "sim-bank-b", name: "Beta Test Bank B (simulated)" },
];

export const SIM_BANK_ACCOUNTS: { accountNumber: string; accountName: string }[] = [
  { accountNumber: "0123456789", accountName: "ADAEZE OBI" },
  { accountNumber: "0234567891", accountName: "BABATUNDE ADEYEMI" },
  { accountNumber: "0345678912", accountName: "CHINEDU EZE" },
  { accountNumber: "0000000000", accountName: "ADAEZE OBI" },
];

export function refForKey(key: string): string {
  return `sim-${key}`;
}

export function keyFromRef(ref: string): string {
  return ref.startsWith("sim-") ? ref.slice(4) : ref;
}

export function collectionAccountNumber(key: string): string {
  const digest = sha256Hex(key);
  let digits = "";
  for (const ch of digest) {
    if (digits.length >= 8) break;
    if (ch >= "0" && ch <= "9") digits += ch;
  }
  return `99${digits.padEnd(8, "0").slice(0, 8)}`;
}

function settleSecondsFor(provider: ProviderId): number {
  return provider === "yellowcard"
    ? policy.sim.yellowcard.settleSeconds
    : policy.sim.paycrest.settleSeconds;
}

export async function applyLazyOutcome(row: SimRampTx): Promise<SimRampTx> {
  const at = now();
  if (row.state === "pending" && row.expiresAt !== null && at >= row.expiresAt && row.kind === "collection") {
    const data: Prisma.SimRampTxUpdateInput = { state: "expired", outcome: "expired", updatedAt: at };
    return db.simRampTx.update({ where: { id: row.id }, data });
  }
  if (row.state === "pending" && row.settleAt !== null && at >= row.settleAt) {
    if (row.kind === "payout") {
      const fault = await db.simFault.findUnique({
        where: { scope_key: { scope: "payout", key: row.key } },
      });
      const blocked = row.destinationAccountNumber === "0000000000" || fault !== null;
      const data: Prisma.SimRampTxUpdateInput = blocked
        ? { state: "failed", outcome: fault ? "injected fault" : "blocked destination", updatedAt: at }
        : {
            state: "complete",
            outcome: "complete",
            bankReference: `BR-${sha256Hex(`br:${row.provider}:${row.key}`).slice(0, 12).toUpperCase()}`,
            updatedAt: at,
          };
      return db.simRampTx.update({ where: { id: row.id }, data });
    }
    if (row.kind === "collection") {
      const data: Prisma.SimRampTxUpdateInput = { state: "complete", outcome: "complete", updatedAt: at };
      return db.simRampTx.update({ where: { id: row.id }, data });
    }
  }
  if (row.state === "refunding" && row.settleAt !== null && at >= row.settleAt) {
    const data: Prisma.SimRampTxUpdateInput = { state: "refunded", outcome: "refunded", updatedAt: at };
    return db.simRampTx.update({ where: { id: row.id }, data });
  }
  return row;
}

export const simRamp = {
  rateOverride: {} as { buy?: string; sell?: string },

  async markCollectionPaid(
    provider: ProviderId,
    key: string,
    input: { ngnAmount: bigint; senderName: string },
  ): Promise<void> {
    const at = now();
    const data: Prisma.SimRampTxUpdateInput = {
      state: "complete",
      ngnAmount: input.ngnAmount,
      senderName: input.senderName,
      outcome: "complete",
      updatedAt: at,
    };
    await db.simRampTx.update({
      where: { provider_key: { provider, key } },
      data,
    });
  },

  async markCollectionFailed(provider: ProviderId, key: string): Promise<void> {
    const data: Prisma.SimRampTxUpdateInput = {
      state: "failed",
      outcome: "failed",
      updatedAt: now(),
    };
    await db.simRampTx.update({
      where: { provider_key: { provider, key } },
      data,
    });
  },

  async addFault(scope: string, key: string): Promise<void> {
    await db.$executeRawUnsafe(
      `INSERT INTO "sim_faults" (id, scope, key) VALUES ($1, $2, $3) ON CONFLICT (scope, key) DO NOTHING`,
      `fault-${sha256Hex(`${scope}:${key}`).slice(0, 24)}`,
      scope,
      key,
    );
  },

  async seedFloat(provider: ProviderId, usd: bigint): Promise<void> {
    await db.$executeRawUnsafe(
      `INSERT INTO "sim_ramp_txs" (id, provider, key, kind, state, "usdAmount", "createdAt", "updatedAt")
       VALUES ($1, $2::"ProviderId", 'seed', 'seed', 'complete', $3, $4, $4)
       ON CONFLICT (provider, key) DO UPDATE SET "usdAmount" = EXCLUDED."usdAmount", "updatedAt" = EXCLUDED."updatedAt"`,
      `seed-${provider}`,
      provider,
      usd,
      now(),
    );
  },

  async floatBalance(provider: ProviderId): Promise<bigint> {
    const rows = await db.$queryRaw<Array<{ total: string }>>`
      SELECT COALESCE(SUM(CASE
        WHEN kind = 'seed' THEN "usdAmount"
        WHEN kind = 'collection' AND state = 'complete' THEN "usdAmount"
        WHEN kind = 'settlement_in' AND state = 'complete' THEN "usdAmount"
        WHEN kind = 'payout' AND state <> 'failed' THEN -"usdAmount"
        WHEN kind = 'settlement_out' AND state = 'complete' THEN -"usdAmount"
        ELSE 0
      END), 0)::text AS total
      FROM "sim_ramp_txs" WHERE provider = ${provider}::"ProviderId"
    `;
    return BigInt(rows[0]?.total ?? "0");
  },

  settleSecondsFor,
};
