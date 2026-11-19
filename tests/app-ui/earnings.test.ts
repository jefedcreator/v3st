import { expect, it } from "vitest";

import { choiceLine, minimumPayoutLine, outcomeLabel } from "@/components/app/earnings/earnings";
import type { AppEarningsDto, AppEarningsWeekDto } from "@/types/app";

function earnings(o: Partial<AppEarningsDto> = {}): AppEarningsDto {
  const base: AppEarningsDto = {
    total_earned_kobo: "0",
    this_week_kobo: "0",
    choice: "unset",
    reinvest_stock: null,
    next_payout_on: "2026-11-20",
    minimum_payout_kobo: "200000",
    limits: [],
    weeks: [],
  };
  return { ...base, ...o };
}

function ref(name: string): { id: string; ticker: string; name: string; logo_path: null } {
  return { id: "stk1", ticker: name.slice(0, 2).toUpperCase(), name, logo_path: null };
}

it("names weekly outcomes and the choice", () => {
  const outcomes: AppEarningsWeekDto["outcome"][] = ["pending", "paid", "reinvested", "rolled_over", "mixed"];
  expect(outcomes.map(outcomeLabel)).toEqual([
    "Pending",
    "Paid to your bank",
    "Reinvested",
    "Rolled over",
    "Part paid, part reinvested",
  ]);
  expect(choiceLine(earnings({ choice: "payout" }))).toBe("Paid to your bank on Fridays");
  expect(choiceLine(earnings({ choice: "reinvest", reinvest_stock: ref("Apple") }))).toBe(
    "Reinvested in Apple",
  );
  expect(choiceLine(earnings({ choice: "unset" }))).toBeNull();
  expect(minimumPayoutLine("200000")).toBe(
    "Payouts start at ₦2,000. Smaller amounts roll over to the next week.",
  );
});
