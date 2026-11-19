import { expect, it } from "vitest";

import { setupProgress } from "@/components/app/setup/setup-steps";
import { isValidPin, pinsMatch } from "@/components/app/pin/pin";
import { isValidAccountNumber } from "@/components/app/bank/bank";
import type { AppOnboardingDto, AppOnboardingStepKey } from "@/types/app";

function onboarding(o: {
  done: AppOnboardingStepKey[];
  next: AppOnboardingStepKey | null;
}): AppOnboardingDto {
  const order: AppOnboardingStepKey[] = ["identity", "pin", "agreements", "bank_account"];
  return {
    complete: o.next === null,
    next_step: o.next,
    steps: order.map((key) => ({
      key,
      title: key,
      done: o.done.includes(key),
      required: true,
    })),
  };
}

it("finds the current step from the API", () => {
  expect(setupProgress(onboarding({ done: ["identity"], next: "pin" }))).toMatchObject({
    index: 1,
    total: 4,
    current: { key: "pin" },
  });
  expect(
    setupProgress(onboarding({ done: ["identity", "pin", "agreements", "bank_account"], next: null }))
      .current,
  ).toBeNull();
});

it("validates PINs and account numbers", () => {
  expect(isValidPin("1357")).toBe(true);
  for (const bad of ["135", "13579", "13a7", ""]) expect(isValidPin(bad)).toBe(false);
  expect(pinsMatch("1357", "1357")).toBe(true);
  expect(isValidAccountNumber("0123456789")).toBe(true);
  expect(isValidAccountNumber("012345678")).toBe(false);
});
