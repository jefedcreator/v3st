import type { ErrorCode } from "@/types";

export type CustomerErrorCode =
  | "SIGN_IN_REQUIRED"
  | "SIGN_IN_AGAIN"
  | "NOT_ALLOWED"
  | "NOT_FOUND"
  | "CHECK_DETAILS"
  | "TRY_AGAIN"
  | "PRICE_CHANGED"
  | "NOT_ENOUGH_CASH"
  | "NOT_ENOUGH_SHARES"
  | "LIMIT_REACHED"
  | "SETUP_REQUIRED"
  | "DOCUMENT_UPDATED"
  | "NAME_MISMATCH"
  | "ALREADY_DONE"
  | "ACCOUNT_EXISTS"
  | "PIN_NEEDED"
  | "PIN_INCORRECT"
  | "PIN_LOCKED"
  | "PIN_TOO_SIMPLE"
  | "BETA_TEST_ACCOUNT"
  | "PROCESSING"
  | "PRICES_UPDATING"
  | "UNAVAILABLE"
  | "ALREADY_STARTED"
  | "ADD_MONEY_PAUSED"
  | "WITHDRAWALS_PAUSED"
  | "TRADING_PAUSED"
  | "TEMPORARILY_UNAVAILABLE"
  | "CONSENT_ENDED"
  | "ACCOUNT_REVIEW"
  | "TOO_MANY_TRIES"
  | "SOMETHING_WENT_WRONG";

export const CUSTOMER_ERROR_COPY = {
  UNAUTHENTICATED: { code: "SIGN_IN_REQUIRED", message: "Please sign in to continue." },
  LOGIN_EXPIRED: { code: "SIGN_IN_AGAIN", message: "Please sign in again to continue." },
  REAUTH_REQUIRED: { code: "SIGN_IN_AGAIN", message: "Please sign in again to continue." },
  FORBIDDEN: { code: "NOT_ALLOWED", message: "You can't do that from this account." },
  CROSS_ORIGIN: { code: "NOT_ALLOWED", message: "You can't do that from this account." },
  NOT_FOUND: { code: "NOT_FOUND", message: "We couldn't find that." },
  ACCOUNT_NOT_FOUND: { code: "NOT_FOUND", message: "We couldn't find that." },
  BAD_REQUEST: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  MALFORMED_JSON: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  VALIDATION_FAILED: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  PAYLOAD_TOO_LARGE: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  AMOUNT_OUT_OF_RANGE: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  BELOW_MINIMUM: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  BELOW_PROVIDER_MINIMUM: { code: "CHECK_DETAILS", message: "Check your details and try again." },
  CONFLICT: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  IDEMPOTENCY_KEY_REQUIRED: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  IDEMPOTENCY_KEY_REUSED: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  STALE_STATE: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  INVALID_TRANSITION: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  LEDGER_KEY_REUSED: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  MODE_MISMATCH: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  NOT_DEAD: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  ALREADY_APPROVED: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  QUOTE_CONSUMED: { code: "TRY_AGAIN", message: "That didn't go through. Please try again." },
  QUOTE_EXPIRED: { code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." },
  QUOTE_CHANGED: { code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." },
  SLIPPAGE: { code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." },
  PRICE_IMPACT_EXCEEDED: { code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." },
  NEEDS_CONFIRMATION: { code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." },
  PREVIEW_EXPIRED: { code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." },
  INSUFFICIENT_FUNDS: { code: "NOT_ENOUGH_CASH", message: "You don't have enough cash for this." },
  INSUFFICIENT_SHARES: { code: "NOT_ENOUGH_SHARES", message: "You don't have that many shares." },
  LIMIT_EXCEEDED: { code: "LIMIT_REACHED", message: "This is above your current limit." },
  AUTHORIZATION_EXCEEDED: { code: "LIMIT_REACHED", message: "This is above your current limit." },
  KYC_REQUIRED: { code: "SETUP_REQUIRED", message: "Finish setting up your account to continue." },
  BANK_ACCOUNT_REQUIRED: { code: "SETUP_REQUIRED", message: "Finish setting up your account to continue." },
  ONBOARDING_INCOMPLETE: { code: "SETUP_REQUIRED", message: "Finish setting up your account to continue." },
  AGREEMENT_OUTDATED: { code: "DOCUMENT_UPDATED", message: "This document was updated. Please review the latest version." },
  NAME_MISMATCH: { code: "NAME_MISMATCH", message: "The name on this bank account doesn't match your verified name." },
  ALREADY_VERIFIED: { code: "ALREADY_DONE", message: "That's already done." },
  IDENTITY_CONFLICT: { code: "ACCOUNT_EXISTS", message: "This email is already linked to another account." },
  PIN_REQUIRED: { code: "PIN_NEEDED", message: "Enter your PIN to continue." },
  PIN_INCORRECT: { code: "PIN_INCORRECT", message: "That PIN isn't right." },
  PIN_LOCKED: { code: "PIN_LOCKED", message: "Too many wrong PINs. Try again in 30 minutes or reset your PIN." },
  PIN_WEAK: { code: "PIN_TOO_SIMPLE", message: "Choose a PIN that's harder to guess." },
  LOGIN_NOT_ALLOWED: { code: "NOT_ALLOWED", message: "Sign in with an email address." },
  TEST_PHONE_REQUIRED: { code: "BETA_TEST_ACCOUNT", message: "During the beta, use a test phone number." },
  OPERATION_UNRESOLVED: { code: "PROCESSING", message: "We're still finishing your last request." },
  CONVERSION_PENDING: { code: "PROCESSING", message: "We're still finishing your last request." },
  REWARD_NOT_CONFIRMED: { code: "PROCESSING", message: "We're still finishing your last request." },
  REFERENCE_STALE: { code: "PRICES_UPDATING", message: "Prices are updating. You can still place your order and it will go through when they do." },
  PRICE_OUT_OF_RANGE: { code: "PRICES_UPDATING", message: "Prices are updating. You can still place your order and it will go through when they do." },
  STOCK_UNAVAILABLE: { code: "UNAVAILABLE", message: "This isn't available right now." },
  CAPABILITY_UNAVAILABLE: { code: "UNAVAILABLE", message: "This isn't available right now." },
  NO_ROUTE: { code: "UNAVAILABLE", message: "This isn't available right now." },
  STRATEGY_UNAVAILABLE: { code: "UNAVAILABLE", message: "This isn't available right now." },
  SCENARIO_UNAVAILABLE: { code: "UNAVAILABLE", message: "This isn't available right now." },
  INVALID_SCENARIO_STATE: { code: "UNAVAILABLE", message: "This isn't available right now." },
  ORDER_NOT_CANCELLABLE: { code: "ALREADY_STARTED", message: "This order has already started and can't be cancelled." },
  DEPOSITS_PAUSED: { code: "ADD_MONEY_PAUSED", message: "Adding money is paused for a short time. You can still view and sell your investments." },
  PAYOUTS_PAUSED: { code: "WITHDRAWALS_PAUSED", message: "Withdrawals are paused for a short time. Your money is safe." },
  TRADING_PAUSED: { code: "TRADING_PAUSED", message: "Trading is paused for a short time. Your money is safe." },
  RAIL_UNAVAILABLE: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  RATES_UNAVAILABLE: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  FLOAT_UNAVAILABLE: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  WALLET_NOT_READY: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  SELL_FAILED: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  PROVIDER_UNVERIFIED: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  SPONSOR_UNAVAILABLE: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  NETWORK_UNHEALTHY: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  CHAIN_RESET_DETECTED: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  RECONCILIATION_BREACH: { code: "TEMPORARILY_UNAVAILABLE", message: "This is taking longer than usual. Your money is safe. Please try again later." },
  AUTHORIZATION_REVOKED: { code: "CONSENT_ENDED", message: "This automatic action was turned off. Set it up again to continue." },
  AUTHORIZATION_EXPIRED: { code: "CONSENT_ENDED", message: "This automatic action was turned off. Set it up again to continue." },
  SCREENING_DENIED: { code: "ACCOUNT_REVIEW", message: "We need to check this. Please contact support." },
  TRAVEL_RULE_DATA_MISSING: { code: "ACCOUNT_REVIEW", message: "We need to check this. Please contact support." },
  RATE_LIMITED: { code: "TOO_MANY_TRIES", message: "Too many tries. Please wait a few minutes and try again." },
  INTERNAL: { code: "SOMETHING_WENT_WRONG", message: "Something went wrong. Please try again." },
} satisfies Record<ErrorCode, { code: CustomerErrorCode; message: string }>;

export function customerErrorFor(code: ErrorCode): { code: CustomerErrorCode; message: string } {
  return CUSTOMER_ERROR_COPY[code];
}

const CUSTOMER_FIELD_MESSAGES: Record<string, string> = {
  amount_kobo: "Check the amount and try again.",
  email: "Enter a valid email address.",
  pin: "Your PIN must be 4 digits.",
  current_pin: "Your PIN must be 4 digits.",
  account_number: "Enter your 10-digit account number.",
  preferred_name: "Use letters only, up to 40 characters.",
};

export function customerFieldMessage(field: string | undefined): string {
  const key = (field ?? "").split(".")[0] ?? "";
  return CUSTOMER_FIELD_MESSAGES[key] ?? "Check your details and try again.";
}
