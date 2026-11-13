import type { RampOrder, TradeOrder } from "@/server/prisma";
import { integrationModes } from "@/backend/integrations/beta-policy";
import { tradeToDto } from "@/backend/services/trades";
import { betaDto, type BetaDto, type RateDto, type TradeDto } from "@/types/dto";
import { formatMinor, rateToDto, type Rate } from "@/utils/money";

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function reduceRate(rate: Rate): Rate {
  const g = gcd(rate.kobo, rate.microUsd);
  return { kobo: rate.kobo / g, microUsd: rate.microUsd / g };
}

export type DepositDto = {
  id: string;
  status: string;
  hold_reason: string | null;
  ngn_amount: string;
  received_ngn_amount: string | null;
  fee_ngn: string | null;
  usd_amount: string | null;
  rate: RateDto | null;
  expires_at: string | null;
  bank_details: {
    bank_name: string;
    account_number: string;
    account_name: string;
    reference: string | null;
    test_details_only: true;
  } | null;
  stock_id: string | null;
  trade: TradeDto | null;
  provider: string;
  beta: BetaDto;
  created_at: string;
  updated_at: string;
};

export function toDepositDto(order: RampOrder, trade?: TradeOrder | null): DepositDto {
  return {
    id: order.id,
    status: order.status,
    hold_reason: order.holdReason,
    ngn_amount: formatMinor(order.ngnAmount),
    received_ngn_amount: order.receivedNgn?.toString() ?? null,
    fee_ngn: order.feeNgn?.toString() ?? null,
    usd_amount: order.usdAmount?.toString() ?? null,
    rate:
      order.rateKobo !== null && order.rateMicroUsd !== null
        ? rateToDto(reduceRate({ kobo: order.rateKobo, microUsd: order.rateMicroUsd }))
        : null,
    expires_at: order.expiresAt?.toISOString() ?? null,
    bank_details: order.payToAccountNumber
      ? {
          bank_name: order.payToBankName ?? "",
          account_number: order.payToAccountNumber,
          account_name: order.payToAccountName ?? "",
          reference: order.payToReference,
          test_details_only: true,
        }
      : null,
    stock_id: order.stockId,
    trade: trade ? tradeToDto(trade) : null,
    provider: order.provider,
    beta: betaDto(integrationModes().yellowcard),
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
  };
}
