import { expect, it } from "vitest";

import {
  defaultPayWith,
  executesSentence,
  previewExpired,
  tradeTitle,
} from "@/components/app/trade/trade";
import type { AppOrderPreviewDto } from "@/types/app";

function preview(overrides: Partial<AppOrderPreviewDto>): AppOrderPreviewDto {
  const base: AppOrderPreviewDto = {
    preview_id: "p1",
    stock: { id: "stk1", ticker: "TSLA", name: "Tesla", logo_path: null },
    side: "buy",
    pay_with: "cash",
    executes: "now",
    amount_kobo: "2000000",
    shares_micro: "4000000",
    price_kobo: "18740000",
    price_limit_kobo: null,
    fees: [],
    you_receive_kobo: null,
    expires_at: "2026-11-19T13:44:00Z",
    order_valid_until: null,
    notes: [],
  };
  return { ...base, ...overrides };
}

it("says when each order goes through", () => {
  expect(executesSentence(preview({ executes: "now" }))).toBe("Goes through now.");
  expect(
    executesSentence(
      preview({
        executes: "when_prices_update",
        price_limit_kobo: "18740000",
        order_valid_until: "2026-11-22T08:40:00Z",
      }),
    ),
  ).toBe("Goes through when prices update, never above ₦187,400. Valid until Sun 22 Nov, 09:40.");
  expect(executesSentence(preview({ executes: "after_your_transfer" }))).toBe(
    "Goes through after your transfer arrives. You'll see the bank details next.",
  );
});

it("defaults to cash only when it covers the amount", () => {
  expect(defaultPayWith("500000", "100000")).toBe("cash");
  expect(defaultPayWith("50000", "100000")).toBe("bank_transfer");
  expect(defaultPayWith(null, "100000")).toBe("bank_transfer");
});

it("knows when a preview has expired", () => {
  expect(previewExpired("2026-11-19T12:00:00Z", new Date("2026-11-19T12:00:01Z"))).toBe(true);
  expect(previewExpired("2026-11-19T12:00:00Z", new Date("2026-11-19T11:59:59Z"))).toBe(false);
  expect(tradeTitle("sell", "Apple")).toBe("Sell Apple");
});
