import { Prisma, type ProviderId, type ProviderMode, type SimRampTx } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { simChain } from "@/backend/services/simulator/chain";
import { CHAINS } from "@/backend/services/wallets/chains";
import { ngnToUsd, rateFromNgnPerUsd, type Rate } from "@/utils/money";
import { sha256Hex } from "@/utils";

import { ProviderError } from "./errors";
import { PAYOUT_FEE_KOBO, payInFeeKobo } from "./fees";
import {
  paycrestFundingAddress,
  paycrestRefundKey,
  paycrestSettleKey,
  paycrestSimAddress,
} from "./paycrest";
import type {
  BankDestination,
  Chain,
  Collection,
  Customer,
  Direction,
  PayoutResult,
  ProviderTx,
  Quote,
  RampProvider,
  SettlementModel,
  WebhookHint,
} from "./types";
import {
  SIM_BANK_ACCOUNTS,
  SIM_BANKS,
  applyLazyOutcome,
  collectionAccountNumber,
  keyFromRef,
  refForKey,
  simRamp,
} from "@/backend/services/simulator/ramp";

function toProviderTx(row: SimRampTx): ProviderTx {
  return {
    ref: refForKey(row.key),
    key: row.key,
    direction: (row.direction ?? "in") as Direction,
    state: row.state as ProviderTx["state"],
    ngnAmount: row.ngnAmount,
    usdAmount: row.usdAmount,
    feeNgn: row.feeNgn,
    senderName: row.senderName,
    bankReference: row.bankReference,
    failureCode: row.state === "failed" ? (row.outcome ?? "FAILED") : null,
    chainSettlement: null,
  };
}

export function createSimulatedRampProvider(id: ProviderId): RampProvider {
  const mode: ProviderMode = "simulated";
  const settlementModel: SettlementModel =
    id === "paycrest" ? "direct_chain" : "partner_float";

  const rampFault = async (): Promise<void> => {
    const fault = await db.simFault.findUnique({
      where: { scope_key: { scope: "ramp", key: id } },
    });
    if (fault) {
      throw new ProviderError("transient", "PROVIDER_DOWN");
    }
  };

  const resolveRow = async (row: SimRampTx): Promise<ProviderTx> => {
    if (id !== "paycrest") {
      return toProviderTx(await applyLazyOutcome(row));
    }
    const at = now();
    if (row.kind === "collection") {
      if (row.state === "complete" && row.recipientAddress) {
        const chain = (row.chain ?? policy.defaultChain) as Chain;
        let remote = await simChain.getTransfer(paycrestSettleKey(row.key));
        if (!remote) {
          await simChain.submit(chain, {
            key: paycrestSettleKey(row.key),
            from: paycrestSimAddress(chain),
            to: row.recipientAddress,
            token: CHAINS[chain].usdc,
            amount: row.usdAmount,
          });
          remote = await simChain.getTransfer(paycrestSettleKey(row.key));
        }
        if (remote?.status === "failed") {
          return {
            ...toProviderTx(row),
            state: "failed",
            failureCode: remote.failureReason ?? "SETTLEMENT_FAILED",
          };
        }
        if (remote?.status === "confirmed") {
          return {
            ...toProviderTx(row),
            chainSettlement: {
              chain,
              txHash: remote.txHash,
              amount: row.usdAmount,
              recipient: row.recipientAddress,
            },
          };
        }
        return { ...toProviderTx(row), state: "pending" };
      }
      return toProviderTx(await applyLazyOutcome(row));
    }
    if (row.kind === "payout") {
      let current = row;
      if (current.state === "pending") {
        const chain = (current.chain ?? policy.defaultChain) as Chain;
        const fault = await db.simFault.findUnique({
          where: { scope_key: { scope: "payout", key: current.key } },
        });
        const blocked = current.destinationAccountNumber === "0000000000";
        if (current.settleAt && at >= current.settleAt && (fault || blocked)) {
          let data: Prisma.SimRampTxUpdateInput = {
            state: "failed",
            outcome: fault ? "injected fault" : "blocked destination",
            updatedAt: at,
          };
          if (blocked && !fault) {
            const order = await db.rampOrder.findFirst({
              where: { provider: id, id: current.key },
            });
            const wallet = order
              ? await db.wallet.findUnique({
                  where: {
                    userId_family: { userId: order.userId, family: CHAINS[chain].family },
                  },
                })
              : null;
            if (wallet) {
              await simChain.mint(
                chain,
                wallet.address,
                current.usdAmount,
                paycrestRefundKey(current.key),
              );
              data = { state: "refunded", outcome: "refunded", updatedAt: at };
            }
          }
          current = await db.simRampTx.update({ where: { id: current.id }, data });
        } else if (!blocked && !fault && current.fundingAddress) {
          const incoming = await db.simChainTx.findFirst({
            where: {
              chain,
              toAddress: current.fundingAddress,
              token: CHAINS[chain].usdc,
              amount: { gte: current.usdAmount },
            },
          });
          if (incoming) {
            const resolved = await simChain.getByHash(chain, incoming.hash);
            if (resolved?.status === "confirmed") {
              current = await db.simRampTx.update({
                where: { id: current.id },
                data: {
                  state: "complete",
                  outcome: "complete",
                  bankReference: `BR-${sha256Hex(`br:${id}:${current.key}`).slice(0, 12).toUpperCase()}`,
                  updatedAt: at,
                },
              });
            } else if (resolved?.status === "failed") {
              current = await db.simRampTx.update({
                where: { id: current.id },
                data: { state: "failed", outcome: "settlement failed", updatedAt: at },
              });
            }
          }
        }
      }
      if (current.state === "refunded") {
        const chain = (current.chain ?? policy.defaultChain) as Chain;
        const remote = await simChain.getTransfer(paycrestRefundKey(current.key));
        return {
          ...toProviderTx(current),
          chainSettlement: remote
            ? { chain, txHash: remote.txHash, amount: current.usdAmount, recipient: "" }
            : null,
        };
      }
      return toProviderTx(current);
    }
    return toProviderTx(await applyLazyOutcome(row));
  };

  const simRates = (): { buy: Rate; sell: Rate } => {
    const cfg = id === "yellowcard" ? policy.sim.yellowcard : policy.sim.paycrest;
    return {
      buy: rateFromNgnPerUsd(simRamp.rateOverride.buy ?? cfg.buyNgnPerUsd),
      sell: rateFromNgnPerUsd(simRamp.rateOverride.sell ?? cfg.sellNgnPerUsd),
    };
  };

  return {
    id,
    mode,
    settlementModel,

    async rates() {
      const { buy, sell } = simRates();
      return { buy, sell, asOf: now() };
    },

    async quote(direction: Direction, ngnAmount: bigint): Promise<Quote> {
      const { buy, sell } = simRates();
      if (direction === "in") {
        if (ngnAmount < policy.deposits.minKobo || ngnAmount > policy.deposits.maxKobo) {
          throw new ProviderError("rejected", "AMOUNT_OUT_OF_RANGE");
        }
        const feeNgn = id === "paycrest" ? 0n : payInFeeKobo(ngnAmount);
        const usdAmount = ngnToUsd(ngnAmount - feeNgn, buy, "floor");
        if (id === "paycrest" && usdAmount < policy.sim.paycrest.minMicroUsd) {
          throw new ProviderError("rejected", "BELOW_PROVIDER_MINIMUM");
        }
        return {
          provider: id,
          direction,
          ngnAmount,
          feeNgn,
          usdAmount,
          rate: buy,
          expiresAt: new Date(now().getTime() + policy.sim.yellowcard.collectionTtlMinutes * 60_000),
          channelRef: null,
        };
      }
      const feeNgn = id === "paycrest" ? 0n : PAYOUT_FEE_KOBO;
      const usdAmount = ngnToUsd(ngnAmount, sell, "ceil");
      if (id === "paycrest" && usdAmount < policy.sim.paycrest.minMicroUsd) {
        throw new ProviderError("rejected", "BELOW_PROVIDER_MINIMUM");
      }
      return {
        provider: id,
        direction,
        ngnAmount,
        feeNgn,
        usdAmount,
        rate: sell,
        expiresAt: new Date(now().getTime() + policy.withdrawals.quoteTtlSeconds * 1_000),
        channelRef: null,
      };
    },

    async createCollection(input): Promise<Collection> {
      await rampFault();
      if (id === "paycrest" && !input.recipient) {
        throw new ProviderError("rejected", "RECIPIENT_REQUIRED");
      }
      const existing = await db.simRampTx.findUnique({
        where: { provider_key: { provider: id, key: input.key } },
      });
      if (existing) {
        throw new ProviderError("duplicate", "DUPLICATE_KEY");
      }
      const at = now();
      const expiresAt = new Date(at.getTime() + policy.sim.yellowcard.collectionTtlMinutes * 60_000);
      const data: Prisma.SimRampTxCreateInput = {
        provider: id,
        key: input.key,
        kind: "collection",
        direction: "in",
        state: "pending",
        ngnAmount: input.quote.ngnAmount,
        usdAmount: input.quote.usdAmount,
        feeNgn: input.quote.feeNgn,
        rateKobo: input.quote.rate.kobo,
        rateMicroUsd: input.quote.rate.microUsd,
        sourceAccountNumber: input.source.accountNumber,
        sourceAccountName: input.source.accountName,
        fundingAddress: input.recipient?.address ?? null,
        chain: input.recipient?.chain ?? null,
        recipientAddress: id === "paycrest" ? (input.recipient?.address ?? null) : null,
        expiresAt,
        createdAt: at,
        updatedAt: at,
      };
      await db.simRampTx.create({ data });
      return {
        ref: refForKey(input.key),
        bankName: "Beta Test Bank (simulated)",
        accountNumber: collectionAccountNumber(input.key),
        accountName: "V3ST BETA TEST",
        reference: null,
        expiresAt,
        locked: input.quote,
      };
    },

    async refundCollection(ref: string): Promise<void> {
      const key = keyFromRef(ref);
      const at = now();
      const data: Prisma.SimRampTxUpdateInput = {
        state: "refunding",
        settleAt: new Date(at.getTime() + simRamp.settleSecondsFor(id) * 1_000),
        updatedAt: at,
      };
      await db.simRampTx.update({
        where: { provider_key: { provider: id, key } },
        data,
      });
    },

    async resolveBankAccount(bankCode: string, accountNumber: string): Promise<string> {
      void bankCode;
      const found = SIM_BANK_ACCOUNTS.find((a) => a.accountNumber === accountNumber);
      if (!found) {
        throw new ProviderError("rejected", "ACCOUNT_NOT_FOUND");
      }
      return found.accountName;
    },

    async listBanks() {
      return SIM_BANKS;
    },

    async createPayout(input): Promise<PayoutResult> {
      await rampFault();
      const chain: Chain = input.chain ?? policy.defaultChain;
      const { sell } = simRates();
      const lockedUsd = ngnToUsd(input.quote.ngnAmount, sell, "ceil");
      if (lockedUsd > input.maxUsd) {
        throw new ProviderError("rate_moved", "RATE_MOVED");
      }
      const existing = await db.simRampTx.findUnique({
        where: { provider_key: { provider: id, key: input.key } },
      });
      if (existing) {
        throw new ProviderError("duplicate", "DUPLICATE_KEY");
      }
      const at = now();
      const locked: Quote = {
        provider: id,
        direction: "out",
        ngnAmount: input.quote.ngnAmount,
        feeNgn: PAYOUT_FEE_KOBO,
        usdAmount: lockedUsd,
        rate: sell,
        expiresAt: new Date(at.getTime() + policy.withdrawals.quoteTtlSeconds * 1_000),
        channelRef: null,
      };
      const data: Prisma.SimRampTxCreateInput = {
        provider: id,
        key: input.key,
        kind: "payout",
        direction: "out",
        state: "pending",
        ngnAmount: locked.ngnAmount,
        usdAmount: lockedUsd,
        feeNgn: locked.feeNgn,
        rateKobo: sell.kobo,
        rateMicroUsd: sell.microUsd,
        destinationAccountNumber: input.destination.accountNumber,
        chain: id === "paycrest" ? chain : null,
        fundingAddress: id === "paycrest" ? paycrestFundingAddress(chain, input.key) : null,
        settleAt: new Date(at.getTime() + simRamp.settleSecondsFor(id) * 1_000),
        createdAt: at,
        updatedAt: at,
      };
      await db.simRampTx.create({ data });
      if (id === "paycrest") {
        return {
          ref: refForKey(input.key),
          locked,
          funding: {
            kind: "chain",
            chain,
            token: "USDC",
            address: paycrestFundingAddress(chain, input.key),
            amount: lockedUsd,
          },
        };
      }
      return {
        ref: refForKey(input.key),
        locked,
        funding: { kind: "float" },
      };
    },

    async getTransaction(direction: Direction, ref: string): Promise<ProviderTx> {
      const key = keyFromRef(ref);
      const row = await db.simRampTx.findUnique({
        where: { provider_key: { provider: id, key } },
      });
      if (!row || row.direction !== direction) {
        throw new ProviderError("not_found", "NOT_FOUND");
      }
      return resolveRow(row);
    },

    async findByKey(direction: Direction, key: string): Promise<ProviderTx | null> {
      const row = await db.simRampTx.findUnique({
        where: { provider_key: { provider: id, key } },
      });
      if (!row || row.direction !== direction) return null;
      return resolveRow(row);
    },

    async floatBalance(): Promise<bigint | null> {
      return simRamp.floatBalance(id);
    },

    verifyWebhook(): boolean {
      return false;
    },

    parseWebhook(): WebhookHint {
      throw new ProviderError("rejected", "NO_WEBHOOKS_IN_SIMULATION");
    },
  };
}


