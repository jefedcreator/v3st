import type { ProviderId, ProviderMode, SettlementModel } from "@/server/prisma";

import type { Rate } from "@/utils/money";

export type { ProviderId, ProviderMode, SettlementModel };

export type Chain = "base" | "solana";
export type Direction = "in" | "out";

export type Quote = {
  provider: ProviderId;
  direction: Direction;
  ngnAmount: bigint;
  feeNgn: bigint;
  usdAmount: bigint;
  rate: Rate;
  expiresAt: Date;
  channelRef: string | null;
};

export type Customer = {
  userId: string;
  name: string;
  phone: string;
  country: "NG";
  dateOfBirth: string | null;
  idType: "BVN";
  idNumber: string | null;
  address: string | null;
};

export type BankDestination = {
  bankCode: string;
  accountNumber: string;
  accountName: string;
};

export type Collection = {
  ref: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  reference: string | null;
  expiresAt: Date;
  locked: Quote;
};

export type PayoutResult = {
  ref: string;
  locked: Quote;
  funding:
    | { kind: "float" }
    | { kind: "chain"; chain: Chain; token: "USDC"; address: string; amount: bigint };
};

export type ProviderTxState =
  | "pending"
  | "complete"
  | "failed"
  | "expired"
  | "refunding"
  | "refunded"
  | "hold";

export type ProviderTx = {
  ref: string;
  key: string | null;
  direction: Direction;
  state: ProviderTxState;
  ngnAmount: bigint | null;
  usdAmount: bigint | null;
  feeNgn: bigint | null;
  senderName: string | null;
  bankReference: string | null;
  failureCode: string | null;
  chainSettlement: {
    chain: Chain;
    txHash: string;
    amount: bigint;
    recipient: string;
  } | null;
};

export type WebhookHint = {
  eventKey: string;
  ref: string;
  key: string | null;
  direction: Direction | null;
  event: string;
};

export interface RampProvider {
  readonly id: ProviderId;
  readonly mode: ProviderMode;
  readonly settlementModel: SettlementModel;
  rates(): Promise<{ buy: Rate; sell: Rate; asOf: Date }>;
  quote(direction: Direction, ngnAmount: bigint): Promise<Quote>;
  createCollection(input: {
    quote: Quote;
    customer: Customer;
    source: BankDestination;
    key: string;
    recipient: { chain: Chain; address: string } | null;
  }): Promise<Collection>;
  refundCollection(ref: string): Promise<void>;
  resolveBankAccount(bankCode: string, accountNumber: string): Promise<string>;
  listBanks(): Promise<{ code: string; name: string }[]>;
  createPayout(input: {
    quote: Quote;
    destination: BankDestination;
    customer: Customer;
    key: string;
    maxUsd: bigint;
  }): Promise<PayoutResult>;
  getTransaction(direction: Direction, ref: string): Promise<ProviderTx>;
  findByKey(direction: Direction, key: string): Promise<ProviderTx | null>;
  floatBalance(): Promise<bigint | null>;
  verifyWebhook(headers: Headers, rawBody: Uint8Array): boolean;
  parseWebhook(rawBody: Uint8Array): WebhookHint;
}
