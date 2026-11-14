import { decimalToMinor } from "@/utils/money";

import type { Direction, ProviderTx, ProviderTxState } from "../types";

const PENDING_STATUSES = new Set([
  "pending",
  "new",
  "initiated",
  "processing",
  "queued",
  "pending_approval",
]);

export function mapYellowCardStatus(status: string): ProviderTxState {
  switch (status) {
    case "complete":
      return "complete";
    case "failed":
    case "denied":
    case "rejected":
    case "cancelled":
      return "failed";
    case "expired":
      return "expired";
    case "pending_refund":
    case "refund_processing":
      return "refunding";
    case "refunded":
      return "refunded";
    case "refund_failed":
      return "hold";
    default:
      return PENDING_STATUSES.has(status) ? "pending" : "hold";
  }
}

export type YellowCardTxPayload = {
  id: string;
  sequenceId?: string | null;
  status: string;
  localAmount?: string | number | null;
  amount?: string | number | null;
  fee?: string | number | null;
  feeLocal?: string | number | null;
  senderName?: string | null;
  bankReference?: string | null;
  errorCode?: string | null;
  [key: string]: unknown;
};

function decimalField(
  value: string | number | null | undefined,
  decimals: number,
): bigint | null {
  if (value === null || value === undefined) return null;
  return decimalToMinor(String(value), decimals, "floor");
}

export function mapYellowCardTx(
  direction: Direction,
  data: YellowCardTxPayload,
): ProviderTx {
  return {
    ref: data.id,
    key: data.sequenceId ?? null,
    direction,
    state: mapYellowCardStatus(data.status),
    ngnAmount: decimalField(data.localAmount, 2),
    usdAmount: decimalField(data.amount, 6),
    feeNgn: decimalField(data.feeLocal ?? data.fee, 2),
    senderName: data.senderName ?? null,
    bankReference: data.bankReference ?? null,
    failureCode: data.errorCode ?? null,
    chainSettlement: null,
  };
}
