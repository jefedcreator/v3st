import { AppApiError } from "@/utils/app-api";

// The API's own copy when it is the API that failed; Privy's own failures get
// one plain sentence.
export function signinErrorMessage(error: unknown): string {
  if (error instanceof AppApiError) return error.message;
  return "That code didn't work. Check it and try again.";
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// A code can be re-sent every 30 seconds.
export function canResend(sentAt: number, now: number): boolean {
  return now - sentAt >= 30_000;
}
