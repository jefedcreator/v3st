import { expect, it } from "vitest";

import { AppApiError } from "@/utils/app-api";
import { canResend, isValidEmail, signinErrorMessage } from "@/components/app/signin/signin";

it("shows the API's copy, or the code message for Privy failures", () => {
  const beta = new AppApiError("During the beta, sign in with a beta test email.", 403, "BETA_TEST_ACCOUNT");
  expect(signinErrorMessage(beta)).toBe("During the beta, sign in with a beta test email.");
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
