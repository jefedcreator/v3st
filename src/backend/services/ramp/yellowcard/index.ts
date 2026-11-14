import { createHmac, timingSafeEqual } from "node:crypto";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { decimalToMinor, ngnToUsd, rateFromNgnPerUsd } from "@/utils/money";

import { ProviderError } from "../errors";
import { PAYOUT_FEE_KOBO, payInFeeKobo } from "../fees";
import type {
  BankDestination,
  Chain,
  Collection,
  Customer,
  Direction,
  PayoutResult,
  ProviderId,
  ProviderMode,
  ProviderTx,
  Quote,
  RampProvider,
  SettlementModel,
  WebhookHint,
} from "../types";
import { createYellowCardClient } from "./client";
import { mapYellowCardStatus, mapYellowCardTx, type YellowCardTxPayload } from "./mapping";
import {
  accountResponseSchema,
  channelsResponseSchema,
  detailsBankResponseSchema,
  networksResponseSchema,
  ratesResponseSchema,
  receiveResponseSchema,
  sendResponseSchema,
  webhookPayloadSchema,
} from "./schemas";

export class YellowCardProvider implements RampProvider {
  readonly id: ProviderId = "yellowcard";
  readonly mode: ProviderMode = "sandbox";
  readonly settlementModel: SettlementModel = "partner_float";

  private readonly secret: string;
  private readonly client: ReturnType<typeof createYellowCardClient>;

  constructor(opts: { apiKey: string; secret: string; fetch?: typeof fetch }) {
    this.secret = opts.secret;
    this.client = createYellowCardClient({
      apiKey: opts.apiKey,
      secret: opts.secret,
      fetch: opts.fetch,
      clock: () => now(),
    });
  }

  async rates(): Promise<{ buy: ReturnType<typeof rateFromNgnPerUsd>; sell: ReturnType<typeof rateFromNgnPerUsd>; asOf: Date }> {
    const raw = await this.client.request("GET", "/rates?currency=NGN");
    const parsed = ratesResponseSchema.parse(raw);
    return {
      buy: rateFromNgnPerUsd(parsed.buy),
      sell: rateFromNgnPerUsd(parsed.sell),
      asOf: now(),
    };
  }

  async quote(direction: Direction, ngnAmount: bigint): Promise<Quote> {
    const { buy, sell } = await this.rates();
    if (direction === "in") {
      if (ngnAmount < policy.deposits.minKobo || ngnAmount > policy.deposits.maxKobo) {
        throw new ProviderError("rejected", "AMOUNT_OUT_OF_RANGE");
      }
      const channelsRaw = await this.client.request("GET", "/channels?country=NG");
      const channels = channelsResponseSchema.parse(channelsRaw);
      const channel = channels.data.find(
        (c) => c.type === "bank" && c.country === "NG" && c.active !== false,
      );
      if (!channel) {
        throw new ProviderError("transient", "NO_BANK_CHANNEL");
      }
      let feeNgn: bigint;
      if (channel.fee !== undefined) {
        feeNgn = decimalToMinor(channel.fee, 2, "floor");
      } else {
        feeNgn = payInFeeKobo(ngnAmount);
      }
      return {
        provider: this.id,
        direction,
        ngnAmount,
        feeNgn,
        usdAmount: ngnToUsd(ngnAmount - feeNgn, buy, "floor"),
        rate: buy,
        expiresAt: new Date(now().getTime() + policy.sim.yellowcard.collectionTtlMinutes * 60_000),
        channelRef: channel.id,
      };
    }
    return {
      provider: this.id,
      direction,
      ngnAmount,
      feeNgn: PAYOUT_FEE_KOBO,
      usdAmount: ngnToUsd(ngnAmount, sell, "ceil"),
      rate: sell,
      expiresAt: new Date(now().getTime() + policy.withdrawals.quoteTtlSeconds * 1_000),
      channelRef: null,
    };
  }

  async createCollection(input: {
    quote: Quote;
    customer: Customer;
    source: BankDestination;
    key: string;
    recipient: { chain: Chain; address: string } | null;
  }): Promise<Collection> {
    const body = {
      sequenceId: input.key,
      localAmount: Number(input.quote.ngnAmount) / 100,
      currency: "NGN",
      country: "NG",
      channelId: input.quote.channelRef ?? undefined,
      forceAccept: true,
      customerType: "retail",
      customerUID: input.customer.userId,
      source: {
        accountName: input.source.accountName,
        accountNumber: input.source.accountNumber,
        accountType: "bank",
        networkId: input.source.bankCode,
      },
      recipient: {
        name: input.customer.name,
        country: "NG",
        phone: input.customer.phone,
        dob: input.customer.dateOfBirth ?? undefined,
        idType: "BVN",
        idNumber: input.customer.idNumber ?? undefined,
        address: input.customer.address ?? undefined,
      },
    };
    const raw = await this.client.request("POST", "/receive", body);
    const parsed = receiveResponseSchema.parse(raw);
    const expiresAt = parsed.expiresAt
      ? new Date(Number(parsed.expiresAt) > 1e12 ? Number(parsed.expiresAt) : Number(parsed.expiresAt) * 1_000)
      : new Date(now().getTime() + policy.sim.yellowcard.collectionTtlMinutes * 60_000);
    const bankInfo = parsed.bankInfo ?? {};
    return {
      ref: parsed.id,
      bankName: bankInfo.bankName ?? "",
      accountNumber: bankInfo.accountNumber ?? "",
      accountName: bankInfo.accountName ?? "",
      reference: bankInfo.reference ?? null,
      expiresAt,
      locked: input.quote,
    };
  }

  async refundCollection(ref: string): Promise<void> {
    await this.client.request("POST", `/receive/${ref}/refund`);
  }

  async resolveBankAccount(bankCode: string, accountNumber: string): Promise<string> {
    const raw = await this.client.request("POST", "/details/bank", {
      accountNumber,
      networkId: bankCode,
    });
    const parsed = detailsBankResponseSchema.parse(raw);
    return parsed.accountName;
  }

  async listBanks(): Promise<{ code: string; name: string }[]> {
    const raw = await this.client.request("GET", "/networks?country=NG");
    const parsed = networksResponseSchema.parse(raw);
    return parsed.data.map((n) => ({ code: n.code ?? n.id, name: n.name ?? n.id }));
  }

  async createPayout(input: {
    quote: Quote;
    destination: BankDestination;
    customer: Customer;
    key: string;
    maxUsd: bigint;
  }): Promise<PayoutResult> {
    const body = {
      sequenceId: input.key,
      localAmount: Number(input.quote.ngnAmount - input.quote.feeNgn) / 100,
      currency: "NGN",
      country: "NG",
      reason: "other",
      customerType: "retail",
      sender: {
        name: input.customer.name,
        country: "NG",
        phone: input.customer.phone,
      },
      destination: {
        accountNumber: input.destination.accountNumber,
        accountType: "bank",
        accountName: input.destination.accountName,
        networkId: input.destination.bankCode,
      },
    };
    const raw = await this.client.request("POST", "/send", body);
    const parsed = sendResponseSchema.parse(raw);
    const lockedUsd = parsed.amount !== undefined
      ? decimalToMinor(String(parsed.amount), 6, "floor")
      : input.quote.usdAmount;
    const locked: Quote = {
      provider: this.id,
      direction: "out",
      ngnAmount: input.quote.ngnAmount,
      feeNgn: input.quote.feeNgn,
      usdAmount: lockedUsd,
      rate: input.quote.rate,
      expiresAt: input.quote.expiresAt,
      channelRef: input.quote.channelRef,
    };
    if (lockedUsd > input.maxUsd) {
      throw new ProviderError("rate_moved", "RATE_MOVED");
    }
    await this.client.request("POST", `/send/${parsed.id}/accept`);
    return { ref: parsed.id, locked, funding: { kind: "float" } };
  }

  async getTransaction(direction: Direction, ref: string): Promise<ProviderTx> {
    const resource = direction === "in" ? "receive" : "send";
    const raw = await this.client.request("GET", `/${resource}/${ref}`);
    return mapYellowCardTx(direction, receiveResponseSchema.parse(raw));
  }

  async findByKey(direction: Direction, key: string): Promise<ProviderTx | null> {
    const resource = direction === "in" ? "receive" : "send";
    try {
      const raw = await this.client.request("GET", `/${resource}/sequence-id/${key}`);
      return mapYellowCardTx(direction, sendResponseSchema.parse(raw));
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "not_found") return null;
      throw error;
    }
  }

  async floatBalance(): Promise<bigint | null> {
    const raw = await this.client.request("GET", "/account");
    const parsed = accountResponseSchema.parse(raw);
    const usd = parsed.accounts.find(
      (a) => a.currency === "USD" && (a.currencyType === undefined || a.currencyType === "fiat"),
    );
    if (!usd) return null;
    return decimalToMinor(String(usd.available), 6, "floor");
  }

  verifyWebhook(headers: Headers, rawBody: Uint8Array): boolean {
    const signature = headers.get("X-YC-Signature");
    if (!signature) return false;
    const expected = createHmac("sha256", this.secret).update(rawBody).digest("base64");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: Uint8Array): WebhookHint {
    const parsed = webhookPayloadSchema.parse(
      JSON.parse(new TextDecoder().decode(rawBody)),
    );
    const direction: Direction | null = /^(RECEIVE|COLLECTION)\./i.test(parsed.event)
      ? "in"
      : /^(SEND|PAYMENT)\./i.test(parsed.event)
        ? "out"
        : null;
    return {
      eventKey: `${parsed.id}:${parsed.event}:${parsed.executedAt ?? parsed.status}`,
      ref: parsed.id,
      key: parsed.sequenceId ?? null,
      direction,
      event: parsed.event,
    };
  }
}

export { mapYellowCardStatus };
