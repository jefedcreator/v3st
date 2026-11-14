import { expect, it } from "vitest";

import { PAYOUT_FEE_KOBO, payInFeeKobo } from "@/backend/services/ramp/fees";

it("charges the published pay-in fee schedule", () => {
  expect(payInFeeKobo(2_000_000n)).toBe(20_000n); // ₦20,000 → ₦200
  expect(payInFeeKobo(100_000n)).toBe(5_500n); // ₦1,000 → ₦55 minimum
  expect(payInFeeKobo(9_999_900n)).toBe(99_999n); // 1% under ₦100,000
  expect(payInFeeKobo(10_000_000n)).toBe(135_000n); // 0.5% with ₦1,350 minimum
  expect(payInFeeKobo(300_000_000n)).toBe(1_500_000n); // 0.5% above minimum
});

it("charges the flat payout fee", () => {
  expect(PAYOUT_FEE_KOBO).toBe(10_000n);
});
