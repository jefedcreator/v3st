import { expect, it } from "vitest";

import {
  priceCaption,
  returnText,
  tradingChip,
} from "@/components/app/stocks/price-status";

const now = new Date("2026-11-19T15:00:00Z");

it("captions delayed and missing prices", () => {
  expect(priceCaption("live", "2026-11-19T14:59:00Z", now)).toBeNull();
  expect(priceCaption("delayed", "2026-11-19T12:40:00Z", now)).toBe("Delayed · 13:40");
  expect(priceCaption("delayed", "2026-11-18T20:00:00Z", now)).toBe("Delayed · Wed 18 Nov, 21:00");
  expect(priceCaption("unavailable", null, now)).toBe("Price unavailable");
  expect(tradingChip("available")).toBeNull();
  expect(tradingChip("prices_updating")).toBe("Prices updating");
  expect(tradingChip("paused")).toBe("Trading paused");
  expect(returnText(342)).toBe("+3.42%");
  expect(returnText(null)).toBeNull();
});
