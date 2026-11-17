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

export type AppOnboardingSummaryDto = {
  complete: boolean;
  next_step: string | null;
};

export type AppSessionDto =
  | { signed_in: false; beta: AppBetaDto }
  | {
      signed_in: true;
      customer: { first_name: string | null; email: string | null };
      onboarding: AppOnboardingSummaryDto;
      beta: AppBetaDto;
    };
