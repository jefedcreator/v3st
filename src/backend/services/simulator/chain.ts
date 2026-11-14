import { createHash } from "node:crypto";

import type { SimChainTx } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { sha256Hex } from "@/utils";

import { CHAINS, type Chain } from "@/backend/services/wallets/chains";

type RemoteStatus = "pending" | "confirmed" | "failed";

function hashFor(kind: string, chain: Chain, key: string): string {
  return `0x${sha256Hex(`sim-${kind}:${chain}:${key}`)}`;
}

function faucetAddress(chain: Chain): string {
  if (CHAINS[chain].family === "evm") {
    return `0x${sha256Hex(`sim-evm:faucet:${chain}`).slice(0, 40)}`;
  }
  return `faucet-${createHash("sha256").update(`sim-sol:faucet:${chain}`).digest("hex").slice(0, 32)}`;
}

async function resolveStatus(
  row: SimChainTx,
): Promise<{ status: RemoteStatus; failureReason: string | null }> {
  const fault = await db.simFault.findUnique({
    where: { scope_key: { scope: "chain", key: row.key } },
  });
  if (fault) {
    return { status: "failed", failureReason: "injected fault" };
  }
  if (now() >= row.confirmAt) {
    return { status: "confirmed", failureReason: null };
  }
  return { status: "pending", failureReason: null };
}

export const simChain = {
  async submit(
    chain: Chain,
    input: {
      key: string;
      from: string;
      to: string;
      token: string;
      amount: bigint;
    },
  ): Promise<{ txHash: string }> {
    const existing = await db.simChainTx.findUnique({ where: { key: input.key } });
    if (existing) {
      return { txHash: existing.hash };
    }
    const hash = hashFor("tx", chain, input.key);
    await db.simChainTx.create({
      data: {
        key: input.key,
        chain,
        hash,
        fromAddress: input.from,
        toAddress: input.to,
        token: input.token,
        amount: input.amount,
        status: "pending",
        confirmAt: new Date(now().getTime() + CHAINS[chain].confirmSeconds * 1_000),
      },
    });
    return { txHash: hash };
  },

  async mint(chain: Chain, address: string, amount: bigint, key: string): Promise<{ txHash: string }> {
    const existing = await db.simChainTx.findUnique({ where: { key } });
    if (existing) return { txHash: existing.hash };
    const hash = hashFor("mint", chain, key);
    await db.simChainTx.create({
      data: {
        key,
        chain,
        hash,
        fromAddress: faucetAddress(chain),
        toAddress: address,
        token: CHAINS[chain].usdc,
        amount,
        status: "confirmed",
        confirmAt: now(),
      },
    });
    return { txHash: hash };
  },

  async addFault(key: string): Promise<void> {
    await db.$executeRawUnsafe(
      `INSERT INTO "sim_faults" (id, scope, key) VALUES ($1, 'chain', $2) ON CONFLICT (scope, key) DO NOTHING`,
      `fault-${sha256Hex(`chain:${key}`).slice(0, 24)}`,
      key,
    );
  },

  async getTransfer(
    key: string,
  ): Promise<{ status: RemoteStatus; txHash: string; failureReason: string | null } | null> {
    const row = await db.simChainTx.findUnique({ where: { key } });
    if (!row) return null;
    const resolved = await resolveStatus(row);
    return { status: resolved.status, txHash: row.hash, failureReason: resolved.failureReason };
  },

  async getByHash(
    chain: Chain,
    txHash: string,
  ): Promise<{
    status: RemoteStatus;
    from: string;
    to: string;
    token: string;
    amount: bigint;
  } | null> {
    const row = await db.simChainTx.findFirst({ where: { chain, hash: txHash } });
    if (!row) return null;
    const resolved = await resolveStatus(row);
    return {
      status: resolved.status,
      from: row.fromAddress,
      to: row.toAddress,
      token: row.token,
      amount: row.amount,
    };
  },

  async balance(chain: Chain, address: string, token: string): Promise<bigint> {
    const rows = await db.$queryRaw<Array<{ balance: string }>>`
      SELECT COALESCE(
        SUM(CASE WHEN t."toAddress" = ${address} THEN t."amount" ELSE 0 END)
        - SUM(CASE WHEN t."fromAddress" = ${address} THEN t."amount" ELSE 0 END),
        0
      )::text AS balance
      FROM "sim_chain_txs" t
      WHERE t.chain = ${chain}
        AND t.token = ${token}
        AND t."confirmAt" <= ${now()}
        AND NOT EXISTS (
          SELECT 1 FROM "sim_faults" f WHERE f.scope = 'chain' AND f.key = t.key
        )
    `;
    return BigInt(rows[0]?.balance ?? "0");
  },
};
