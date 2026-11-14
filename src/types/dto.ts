import type { ProviderMode } from "@/backend/integrations/beta-policy";
import type { EarningsMode, KycStatus, UserRole, WalletFamily } from "@/server/prisma";

export type BetaDto = { stage: "beta"; mode: ProviderMode; test_funds_only: true };

export function betaDto(mode: ProviderMode): BetaDto {
  return { stage: "beta", mode, test_funds_only: true };
}

export type KycDto = {
  status: KycStatus;
  tier: number;
  verified_name: string | null;
  simulated: boolean;
};

export type PersonaDto = {
  id: string;
  label: string;
  tier: number;
  outcome: "verified" | "rejected";
};

export type BankDto = {
  bank_code: string;
  bank_name: string;
};

export type BankAccountDto = {
  id: string;
  bank_code: string;
  bank_name: string;
  account_number_masked: string;
  resolved_name: string;
  created_at: string;
};

export type MeDto = {
  id: string;
  phone: string;
  role: UserRole;
  kyc: KycDto;
  wallets: { family: WalletFamily; address: string }[];
  bank_account: BankAccountDto | null;
  earnings_preference: { mode: EarningsMode; stock_id: string | null };
  beta: { stage: "beta"; test_funds_only: true };
};

export type RateDto = { kobo: string; micro_usd: string; ngn_per_usd: string };

export type StockDto = {
  id: string;
  symbol: string;
  name: string;
  chain: string;
  decimals: number;
  price_usdc: string | null;
  simulated: true;
};

export type TradeDto = {
  id: string;
  side: "buy" | "sell";
  stock_id: string;
  status: string;
  amount_in: string;
  amount_out: string | null;
  min_amount_out: string | null;
  failure_reason: string | null;
  retryable: boolean;
  created_at: string;
};

export type PortfolioHoldingDto = {
  stock_id: string;
  symbol: string;
  name: string;
  quantity: string;
  decimals: number;
  price_usdc: string | null;
  value_usdc: string | null;
  value_ngn: string | null;
};

export type PortfolioDto = {
  cash_usdc: string;
  reserved_usdc: string;
  pending_usdc: string;
  earnings_usdc: string;
  cash_ngn: string | null;
  pending_ngn: string | null;
  earnings_ngn: string | null;
  holdings: PortfolioHoldingDto[];
  rate: RateDto | null;
  valuation: "ok" | "partial" | "unavailable";
  as_of: string;
  beta: BetaDto;
};

export type EarningsWeekDto = {
  week: string;
  earned_usdc: string;
  paid_usdc: string;
  reinvested_usdc: string;
  pending_usdc: string;
  ngn_value: string | null;
  status: "pending" | "paid" | "reinvested" | "mixed";
};

export type EarningsPreferenceDto = {
  mode: "unset" | "payout" | "reinvest";
  stock_id: string | null;
  minimum_payout_ngn: string;
  payout_fee_ngn: string | null;
};

export type ControlDto = {
  scope: string;
  paused: boolean;
  reason: string | null;
  updated_by: string | null;
};

export type OpsStatusDto = {
  controls: ControlDto[];
  open_alerts: { id: string; kind: string; severity: string; message: string; created_at: string }[];
  dead_jobs: number;
  oldest_pending_job_age_seconds: number | null;
  awaiting_approval_transfers: number;
  last_reconciliation: { id: string; as_of: string; status: string } | null;
};

export type TransferDto = {
  id: string;
  key: string;
  purpose: string;
  status: string;
  chain: string;
  from_address: string;
  to_address: string;
  amount: string;
  approvals: string[];
  failure_reason: string | null;
};

export type UserEventDto = {
  id: string;
  type: string;
  subject_id: string;
  status: string | null;
  created_at: string;
};
