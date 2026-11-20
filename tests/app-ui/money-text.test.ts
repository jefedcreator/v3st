import { expect, it } from "vitest";
import { moneyText } from "@/primitives/money-text";

it("renders unknown as a dash, never ₦0", () => {
  expect(moneyText(null)).toBe("—");
  expect(moneyText("0")).toBe("₦0");
  expect(moneyText("500000")).toBe("₦5,000");
  expect(moneyText("500000", "out")).toBe("−₦5,000");
});
