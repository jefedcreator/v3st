import type { Prisma, ProviderId } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import type { ProviderMode } from "@/backend/integrations/beta-policy";
import { refForKey } from "@/backend/services/simulator/ramp";
import { simChain } from "@/backend/services/simulator/chain";
import { simulatedAddress } from "@/backend/services/wallets/simulated";
import { walletService } from "@/backend/services/wallets";
import { CHAINS, type Chain } from "@/backend/services/wallets/chains";

export interface SettlementProvider {
  readonly mode: ProviderMode;
  topUpAddress(provider: ProviderId, chain: Chain): Promise<string>;
  confirmTopUp(i: {
    key: string;
    provider: ProviderId;
    chain: Chain;
    usdc: bigint;
    txHash: string;
  }): Promise<{ state: "pending" | "complete" | "failed"; usdCredited: bigint | null }>;
  requestWithdrawal(i: {
    key: string;
    provider: ProviderId;
    chain: Chain;
    usd: bigint;
    address: string;
  }): Promise<{ ref: string }>;
  getWithdrawal(
    key: string,
  ): Promise<{ state: "pending" | "complete" | "failed"; usdcSent: bigint | null; txHash: string | null }>;
}

export const simulatedSettlement: SettlementProvider = {
  mode: "simulated",

  async topUpAddress(provider: ProviderId, chain: Chain): Promise<string> {
    return simulatedAddress(`topup:${provider}:${chain}`, CHAINS[chain].family);
  },

  async confirmTopUp(i) {
    const existing = await db.simRampTx.findUnique({
      where: { provider_key: { provider: i.provider, key: i.key } },
    });
    if (existing?.kind === "settlement_in") {
      return {
        state: existing.state === "complete" ? "complete" : existing.state === "failed" ? "failed" : "pending",
        usdCredited: existing.state === "complete" ? existing.usdAmount : null,
      };
    }
    const topUp = await this.topUpAddress(i.provider, i.chain);
    const observed = await walletService.observeIncoming(i.chain, i.txHash, {
      to: topUp,
      amount: i.usdc,
    });
    if (observed === "mismatch") {
      return { state: "failed", usdCredited: null };
    }
    const state = observed === "confirmed" ? "complete" : "pending";
    const data: Prisma.SimRampTxCreateInput = {
      provider: i.provider,
      key: i.key,
      kind: "settlement_in",
      state,
      usdAmount: i.usdc,
      chain: i.chain,
      recipientAddress: topUp,
      outcome: state,
      settleAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    await db.simRampTx.create({ data });
    return { state, usdCredited: state === "complete" ? i.usdc : null };
  },

  async requestWithdrawal(i) {
    const existing = await db.simRampTx.findUnique({
      where: { provider_key: { provider: i.provider, key: i.key } },
    });
    if (existing) return { ref: refForKey(i.key) };
    const at = now();
    await db.simRampTx.create({
      data: {
        provider: i.provider,
        key: i.key,
        kind: "settlement_out",
        direction: "out",
        state: "pending",
        usdAmount: i.usd,
        chain: i.chain,
        recipientAddress: i.address,
        settleAt: new Date(at.getTime() + policy.sim.yellowcard.settleSeconds * 1_000),
        createdAt: at,
        updatedAt: at,
      },
    });
    return { ref: refForKey(i.key) };
  },

  async getWithdrawal(key) {
    const row = await db.simRampTx.findFirst({ where: { key, kind: "settlement_out" } });
    if (!row) return { state: "failed", usdcSent: null, txHash: null };
    if (row.state === "pending" && row.settleAt !== null && now() >= row.settleAt) {
      const chain = (row.chain ?? "base") as Chain;
      const minted = await simChain.mint(chain, row.recipientAddress!, row.usdAmount, `settle:${key}`);
      const updated = await db.simRampTx.update({
        where: { id: row.id },
        data: { state: "complete", outcome: "complete", bankReference: minted.txHash, updatedAt: now() },
      });
      return { state: "complete", usdcSent: updated.usdAmount, txHash: minted.txHash };
    }
    if (row.state === "complete") {
      return { state: "complete", usdcSent: row.usdAmount, txHash: row.bankReference };
    }
    if (row.state === "failed") {
      return { state: "failed", usdcSent: null, txHash: null };
    }
    return { state: "pending", usdcSent: null, txHash: null };
  },
};
