import { expect, it } from "vitest";

import { totalLines } from "@/components/app/home/total";
import type { AppHomeDto } from "@/types/app";

function home(overrides: Partial<AppHomeDto> = {}): AppHomeDto {
  const base: AppHomeDto = {
    greeting_name: null,
    total_kobo: null,
    total_status: "unavailable",
    as_of: "2026-11-19T13:20:00Z",
    change_24h_kobo: null,
    cash: { available_kobo: null, on_hold_kobo: null, incoming_kobo: null, as_of: "2026-11-19T13:20:00Z" },
    invested_kobo: null,
    earn_kobo: null,
    earnings: { this_week_kobo: null, next_payout_on: "2026-11-20", choice: "unset" },
    holdings: [],
    open_orders: [],
    action_items: [],
    beta: { test_money: true, notice: "" },
  };
  return { ...base, ...overrides };
}

it("never shows ₦0 for an unknown total", () => {
  expect(totalLines(home({ total_kobo: null, total_status: "unavailable" }))).toEqual({
    figure: "—",
    note: "Your total isn't available right now.",
    change: null,
  });
  expect(
    totalLines(
      home({ total_kobo: "18425040", total_status: "partial", change_24h_kobo: "231015" }),
    ),
  ).toEqual({
    figure: "₦184,250.40",
    note: "Some prices are unavailable, so this total leaves them out.",
    change: "+₦2,310.15 today",
  });
  expect(
    totalLines(home({ total_kobo: "18425040", change_24h_kobo: "-231015" })).change,
  ).toBe("−₦2,310.15 today");
});
