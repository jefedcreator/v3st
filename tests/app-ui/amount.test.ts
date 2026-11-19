import { expect, it } from "vitest";

import {
  amountCheck,
  amountMessage,
} from "@/components/app/money/amount";
import { pinErrorAction } from "@/components/app/money/money-job";

const limits = { minKobo: "100000", maxKobo: "500000000" };

it("checks amounts against policy and available cash", () => {
  expect(amountCheck(null, limits)).toBe("empty");
  expect(amountCheck("99999", limits)).toBe("below_minimum");
  expect(amountCheck("500000001", limits)).toBe("above_maximum");
  expect(amountCheck("300000", { availableKobo: "200000" })).toBe("above_available");
  expect(amountCheck("100000", limits)).toBe("ok");
  expect(amountCheck("200000", { availableKobo: null })).toBe("ok");
});

it("messages each check with policy figures", () => {
  expect(amountMessage("below_minimum", limits)).toBe("The minimum is ₦1,000.");
  expect(amountMessage("above_maximum", limits)).toBe(
    "The most you can move at once is ₦5,000,000.",
  );
  expect(amountMessage("above_available", {})).toBe("That's more than your available cash.");
  expect(amountMessage("empty", limits)).toBe("Enter an amount.");
  expect(amountMessage("ok", limits)).toBeNull();
});

it("branches on error codes only", () => {
  expect(pinErrorAction("PIN_INCORRECT")).toBe("clear_pin");
  expect(pinErrorAction("PIN_LOCKED")).toBe("locked");
  expect(pinErrorAction("PRICE_CHANGED")).toBe("new_price");
  expect(pinErrorAction("NOT_ENOUGH_CASH")).toBe("show");
});
