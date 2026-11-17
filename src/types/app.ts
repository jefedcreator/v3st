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
