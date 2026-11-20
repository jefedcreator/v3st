import { expect, it } from "vitest";
import { moneyLimits } from "@/server/app/limits";

it("passes policy limits as strings", () => {
  expect(moneyLimits()).toEqual({
    depositMinKobo: "100000",
    depositMaxKobo: "500000000",
    buyMinKobo: "100000",
    earnMinKobo: "500000",
    minPayoutKobo: "200000",
  });
});
