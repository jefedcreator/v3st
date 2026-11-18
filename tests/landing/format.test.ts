import { expect, it } from "vitest";

import {
  counterText,
  formatChangeBps,
  formatNaira,
  formatPriceCaption,
  formatTickerPrice,
} from "@/components/landing/format";

it("formats naira exactly", () => {
  expect(formatNaira("100000")).toBe("₦1,000");
  expect(formatNaira("199999")).toBe("₦1,999.99");
  expect(formatNaira("-200000")).toBe("−₦2,000");
  expect(formatNaira("0")).toBe("₦0");
  expect(formatNaira("900719925474099301")).toBe("₦9,007,199,254,740,993.01");
  for (const bad of ["1e5", "12.5", "", " 1"]) expect(() => formatNaira(bad)).toThrow();
});

it("rounds ticker prices like Katana's price column", () => {
  expect(formatTickerPrice("34215037")).toBe("₦342,150");
  expect(formatTickerPrice("34215050")).toBe("₦342,151");
  expect(formatTickerPrice("99999")).toBe("₦999.99");
});

it("formats signed changes with a true minus", () => {
  expect(formatChangeBps(124)).toBe("+1.24%");
  expect(formatChangeBps(-86)).toBe("−0.86%");
  expect(formatChangeBps(0)).toBe("0.00%");
});

it("dates the caption only when prices aren't from today in Lagos", () => {
  expect(formatPriceCaption(null, new Date("2026-12-04T15:00:00Z"))).toBe(
    "Beta prices appear here when they're available.",
  );
  expect(formatPriceCaption("2026-12-04T13:05:00Z", new Date("2026-12-04T15:00:00Z"))).toBe(
    "Beta prices in naira · updated 14:05 Lagos time",
  );
  expect(formatPriceCaption("2026-12-04T20:00:00Z", new Date("2026-12-05T09:00:00Z"))).toBe(
    "Beta prices in naira · updated Fri 4 Dec, 21:00 Lagos time",
  );
});

it("formats counters while counting and when settled", () => {
  expect(counterText(1000, 0, "₦", "", true)).toBe("₦1,000");
  expect(counterText(523.4, 0, "₦", "", false)).toBe("₦523");
  expect(counterText(12.34, 0, "", " days", false)).toBe("12.3 days");
  expect(counterText(5.4, 0, "", "", false)).toBe("5.40");
  expect(counterText(1, 0, "", "%", true)).toBe("1%");
});
