import { expect, it } from "vitest";

import { counterText } from "@/components/landing/format";
import { nextStage } from "@/components/landing/journey-diagram";

it("cycles diagram stages", () => {
  expect(nextStage(0, 5)).toBe(1);
  expect(nextStage(4, 5)).toBe(0);
});

it("formats counters while counting and when settled", () => {
  expect(counterText(1000, 0, "₦", "", true)).toBe("₦1,000");
  expect(counterText(523.4, 0, "₦", "", false)).toBe("₦523");
  expect(counterText(12.34, 0, "", " days", false)).toBe("12.3 days");
  expect(counterText(5.4, 0, "", "", false)).toBe("5.40");
  expect(counterText(1, 0, "", "%", true)).toBe("1%");
});
