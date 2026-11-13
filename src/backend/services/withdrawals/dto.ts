import type { RampOrder, TradeOrder } from "@/server/prisma";
import { db } from "@/server/db";
import { integrationModes } from "@/backend/integrations/beta-policy";
import { maskAccountNumber } from "@/backend/services/bank-accounts";
import { tradeToDto } from "@/backend/services/trades";
import { betaDto, type BankAccountDto, type BetaDto, type RateDto, type TradeDto } from "@/types/dto";
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

export type WithdrawalQuoteDto = {
  id: string;
  ngn_amount: string;
  fee_ngn: string;
  net_ngn: string;
  debit_usdc: string;
  rate: RateDto;
  stock_id: string | null;
  sell_quantity: string | null;
  bank_account: BankAccountDto;
  expires_at: string;
};

export type WithdrawalDto = {
  id: string;
  kind: string;
  status: string;
  hold_reason: string | null;
  ngn_amount: string;
  fee_ngn: string | null;
  net_ngn: string | null;
  debit_usdc: string | null;
  rate: RateDto | null;
  bank_account: {
    bank_name: string;
    account_number_masked: string;
    resolved_name: string;
  };
  bank_reference: string | null;
  return_status: "none" | "pending" | "returned";
  stock_id: string | null;
  trade: TradeDto | null;
  provider: string;
  beta: BetaDto;
  created_at: string;
  updated_at: string;
};

export async function toWithdrawalDto(order: RampOrder): Promise<WithdrawalDto> {
  const bank = order.sourceBankAccountId
    ? await db.bankAccount.findUnique({ where: { id: order.sourceBankAccountId } })
    : null;
  const trade = await db.tradeOrder.findFirst({ where: { orderId: order.id } });
  const returnTransfer = await db.chainTransfer.findUnique({
    where: { key: `return:${order.id}` },
  });
  const returnStatus: WithdrawalDto["return_status"] = !returnTransfer
    ? "none"
    : returnTransfer.status === "confirmed"
      ? "returned"
      : "pending";
  return {
    id: order.id,
    kind: order.kind,
    status: order.status,
    hold_reason: order.holdReason,
    ngn_amount: formatMinor(order.ngnAmount),
    fee_ngn: order.feeNgn?.toString() ?? null,
    net_ngn: order.netNgn?.toString() ?? null,
    debit_usdc: order.debitUsdc?.toString() ?? null,
    rate:
      order.rateKobo !== null && order.rateMicroUsd !== null
        ? rateToDto(reduceRate({ kobo: order.rateKobo, microUsd: order.rateMicroUsd }))
        : null,
    bank_account: {
      bank_name: order.destBankName ?? bank?.bankName ?? "",
      account_number_masked: order.destAccountNumber
        ? maskAccountNumber(order.destAccountNumber)
        : "",
      resolved_name: order.destAccountName ?? bank?.resolvedName ?? "",
    },
    bank_reference: order.bankReference,
    return_status: returnStatus,
    stock_id: order.stockId,
    trade: trade ? tradeToDto(trade) : null,
    provider: order.provider,
    beta: betaDto(integrationModes().yellowcard),
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
  };
}
