import { Prisma, type ProviderId, type ProviderMode, type SimRampTx } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { ngnToUsd, rateFromNgnPerUsd, type Rate } from "@/utils/money";

import { ProviderError } from "./errors";
import { PAYOUT_FEE_KOBO, payInFeeKobo } from "./fees";
import type {
  BankDestination,
  Collection,
  Customer,
  Direction,
  PayoutResult,
  ProviderTx,
  Quote,
  RampProvider,
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
  const settlementModel = "partner_float" as const;

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
        const feeNgn = payInFeeKobo(ngnAmount);
        const usdAmount = ngnToUsd(ngnAmount - feeNgn, buy, "floor");
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
      const feeNgn = PAYOUT_FEE_KOBO;
      const usdAmount = ngnToUsd(ngnAmount, sell, "ceil");
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
        settleAt: new Date(at.getTime() + simRamp.settleSecondsFor(id) * 1_000),
        createdAt: at,
        updatedAt: at,
      };
      await db.simRampTx.create({ data });
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
      const applied = await applyLazyOutcome(row);
      return toProviderTx(applied);
    },

    async findByKey(direction: Direction, key: string): Promise<ProviderTx | null> {
      const row = await db.simRampTx.findUnique({
        where: { provider_key: { provider: id, key } },
      });
      if (!row || row.direction !== direction) return null;
      const applied = await applyLazyOutcome(row);
      return toProviderTx(applied);
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


