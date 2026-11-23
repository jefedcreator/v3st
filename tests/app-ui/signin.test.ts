import { expect, it } from "vitest";

import { AppApiError } from "@/utils/app-api";
import { canResend, isValidEmail, signinErrorMessage } from "@/components/app/signin/signin";

it("shows the API's copy, or the code message for Privy failures", () => {
  const missingEmail = new AppApiError("Sign in with an email address.", 403, "NOT_ALLOWED");
  expect(signinErrorMessage(missingEmail)).toBe("Sign in with an email address.");
  expect(signinErrorMessage(new Error("privy: invalid code"))).toBe(
    "That code didn't work. Check it and try again.",
  );
});

it("validates emails and paces resends at 30 seconds", () => {
  expect(isValidEmail("ada@v3st.test")).toBe(true);
  expect(isValidEmail("ada")).toBe(false);
  expect(canResend(0, 29_999)).toBe(false);
  expect(canResend(0, 30_000)).toBe(true);
});
