// Customer app DTOs. Every response under /api/v1/app/** is typed here so the
// customer frontend can import these names without pulling in server code.
// Wire format: naira as integer-string kobo (`*_kobo`), shares as integer-string
// millionths (`shares_micro`), US prices as integer-string micro-dollars
// (`*_usd_micro`), signed integer basis points (`*_bps`), ISO times (`*_at`) and
// support references `V3-XXXX-XXXX`. A value the system doesn't know is null,
// never "0".

export const APP_BETA_NOTICE =
  "Beta: test money only. No real naira moves and shares have no value.";

export type AppBetaDto = { test_money: true; notice: string };

export type AppProgress =
  | "waiting"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "action_needed";

// ---- Onboarding, identity, security ----

export type AppOnboardingStepKey = "identity" | "pin" | "agreements" | "bank_account";

export type AppOnboardingStepDto = {
  key: AppOnboardingStepKey;
  title: string;
  done: boolean;
  required: boolean;
};

export type AppOnboardingDto = {
  complete: boolean;
  next_step: AppOnboardingStepKey | null;
  steps: AppOnboardingStepDto[];
};

export type AppOnboardingSummaryDto = {
  complete: boolean;
  next_step: AppOnboardingStepKey | null;
};

export type AppSessionDto =
  | { signed_in: false; beta: AppBetaDto }
  | {
      signed_in: true;
      customer: { first_name: string | null; display_name: string | null; email: string | null };
      onboarding: AppOnboardingSummaryDto;
      unread_notifications: number;
      beta: AppBetaDto;
    };

export type AppTestIdentityDto = {
  id: "ada_tier2" | "tunde_tier1" | "rejected";
  name: string;
  description: string;
};

export type AppDeviceSessionDto = {
  id: string;
  device: string;
  signed_in_at: string;
  current: boolean;
};

// ---- Catalog ----

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export type AppTrading = "available" | "prices_updating" | "paused";
export type AppPriceStatus = "live" | "delayed" | "unavailable";

export type AppStockRefDto = {
  id: string;
  ticker: string;
  name: string;
  logo_path: string | null;
};

export type AppStockListItemDto = AppStockRefDto & {
  sector: string;
  price_kobo: string | null;
  price_usd_micro: string | null;
  price_status: AppPriceStatus;
  price_as_of: string | null;
  change_24h_bps: number | null;
  trading: AppTrading;
  on_watchlist: boolean;
  is_test: boolean;
};

export type AppPositionSummaryDto = {
  shares_micro: string;
  value_kobo: string | null;
  price_status: AppPriceStatus;
};

export type AppStockDetailDto = AppStockListItemDto & {
  summary: string;
  your_position: AppPositionSummaryDto | null;
  earn_product_id: string | null;
  documents: ["how-shares-are-held"];
};

export type AppChartDto = {
  range: ChartRange;
  status: "ok" | "not_enough_data";
  points: { t: string; price_kobo: string }[];
  change_bps: number | null;
};

// ---- Cash ----

export type AppCashDto = {
  available_kobo: string | null;
  on_hold_kobo: string | null;
  incoming_kobo: string | null;
  as_of: string;
};

export type AppPayToDto = {
  bank_name: string;
  account_number: string;
  account_name: string;
  reference: string | null;
  amount_kobo: string;
  expires_at: string | null;
};

export type AppDepositDto = {
  id: string;
  reference: string;
  status: AppProgress;
  title: string;
  amount_kobo: string;
  fee_kobo: string | null;
  you_get_kobo: string | null;
  pay_to: AppPayToDto | null;
  created_at: string;
};

export type AppBankDto = { code: string; name: string };

export type AppBankAccountDto = {
  bank_name: string;
  account_ending: string;
  account_name: string;
};

export type AppWithdrawalPreviewDto = {
  preview_id: string;
  amount_kobo: string;
  fee_kobo: string;
  you_receive_kobo: string;
  to: AppBankAccountDto;
  expires_at: string;
};

export type AppWithdrawalDto = {
  id: string;
  reference: string;
  status: AppProgress;
  title: string;
  amount_kobo: string;
  fee_kobo: string;
  you_receive_kobo: string;
  to: AppBankAccountDto;
  bank_reference: string | null;
  created_at: string;
};

// ---- Orders ----

export type AppFeeLineDto = { label: string; kobo: string | null; note: string | null };

export type AppOrderPreviewDto = {
  preview_id: string;
  stock: AppStockRefDto;
  side: "buy" | "sell";
  pay_with: "cash" | "bank_transfer" | null;
  executes: "now" | "when_prices_update" | "after_your_transfer";
  amount_kobo: string;
  shares_micro: string;
  price_kobo: string;
  price_limit_kobo: string | null;
  fees: AppFeeLineDto[];
  you_receive_kobo: string | null;
  expires_at: string;
  order_valid_until: string | null;
  notes: string[];
};

export type AppOrderStatus =
  | "waiting_for_payment"
  | "waiting_for_price"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type AppTimelineStepDto = { label: string; done: boolean; at: string | null };

export type AppOrderDto = {
  id: string;
  reference: string;
  stock: AppStockRefDto;
  side: "buy" | "sell";
  status: AppOrderStatus;
  title: string;
  detail: string;
  amount_kobo: string | null;
  shares_micro: string | null;
  price_kobo: string | null;
  pay_to: AppPayToDto | null;
  can_cancel: boolean;
  valid_until: string | null;
  timeline: AppTimelineStepDto[];
  created_at: string;
  completed_at: string | null;
};

// ---- Holdings and home ----

export type AppHoldingDto = AppStockRefDto & {
  shares_micro: string;
  on_hold_shares_micro: string;
  value_kobo: string | null;
  price_status: AppPriceStatus;
  price_as_of: string | null;
  cost_kobo: string | null;
  return_kobo: string | null;
  return_bps: number | null;
  trading: AppTrading;
};

export type AppActionItemDto = {
  kind: "finish_setup" | "finish_transfer" | "choose_earnings" | "add_bank_account" | "renew_automation";
  title: string;
  detail: string;
  link: string;
};

export type AppHomeDto = {
  greeting_name: string | null;
  total_kobo: string | null;
  total_status: "ok" | "partial" | "unavailable";
  as_of: string;
  change_24h_kobo: string | null;
  cash: AppCashDto;
  invested_kobo: string | null;
  earn_kobo: string | null;
  earnings: { this_week_kobo: string | null; next_payout_on: string; choice: "payout" | "reinvest" | "unset" };
  holdings: AppHoldingDto[];
  open_orders: AppOrderDto[];
  action_items: AppActionItemDto[];
  beta: AppBetaDto;
};

// ---- Earn and earnings ----

export type AppEarnPositionDto = {
  id: string;
  status: "processing" | "active" | "withdrawing" | "withdrawn" | "action_needed";
  added_kobo: string | null;
  value_kobo: string | null;
  earned_kobo: string;
  joined_at: string;
};

export type AppEarnProductDto = {
  id: string;
  stock: AppStockRefDto;
  title: string;
  summary: string;
  how_it_works: string[];
  risks: string[];
  minimum_kobo: string;
  available: boolean;
  position: AppEarnPositionDto | null;
  documents: ["earn-risks"];
};

export type AppEarnPreviewDto = {
  preview_id: string;
  product_id: string;
  you_add_kobo: string;
  split: { shares_micro: string; cash_kobo: string };
  fees: AppFeeLineDto[];
  expires_at: string;
  automation: string;
  risk_document: { slug: "earn-risks"; version: string };
};

export type AppEarnWithdrawPreviewDto = {
  preview_id: string;
  position_id: string;
  you_get: { shares_micro: string; cash_kobo: string };
  value_kobo: string | null;
  expires_at: string;
};

export type AppEarningsWeekDto = {
  week_of: string;
  earned_kobo: string;
  outcome: "pending" | "paid" | "reinvested" | "rolled_over" | "mixed";
  detail: string;
};

export type AppEarningsDto = {
  total_earned_kobo: string;
  this_week_kobo: string;
  choice: "payout" | "reinvest" | "unset";
  reinvest_stock: AppStockRefDto | null;
  next_payout_on: string;
  minimum_payout_kobo: string;
  limits: string[];
  weeks: AppEarningsWeekDto[];
};

// ---- Activity and notifications ----

export type AppActivityKind =
  | "add_money"
  | "withdrawal"
  | "buy"
  | "sell"
  | "earn_join"
  | "earn_withdraw"
  | "earnings"
  | "earnings_payout"
  | "reinvest";

export type AppActivityItemDto = {
  id: string;
  kind: AppActivityKind;
  title: string;
  subtitle: string;
  amount_kobo: string | null;
  direction: "in" | "out" | "none";
  status: AppProgress;
  occurred_at: string;
  reference: string;
};

export type AppActivityDetailDto = AppActivityItemDto & {
  lines: { label: string; value: string }[];
  timeline: AppTimelineStepDto[];
  bank: AppBankAccountDto | null;
  bank_reference: string | null;
};

export type AppActivityPageDto = { items: AppActivityItemDto[]; next_cursor: string | null };

export type AppNotificationDto = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
};

// ---- Settings ----

export type AppAutomationDto = {
  id: string;
  title: string;
  detail: string;
  active: boolean;
  expires_at: string;
  needs_renewal: boolean;
};

export type AppProfileDto = {
  first_name: string | null;
  preferred_name: string | null;
  email: string | null;
  identity: { verified: boolean; level: "standard" | "higher" | null };
  bank_account: AppBankAccountDto | null;
};
