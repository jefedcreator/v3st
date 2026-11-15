import { expect, it } from "vitest";
import { landingDemoFixture as fixture } from "@/components/landing/demo-fixtures";
it("keeps independent examples internally exact", () => {
  expect(
    BigInt(fixture.funding.grossKobo) - BigInt(fixture.funding.feeKobo),
  ).toBe(BigInt(fixture.funding.availableKobo));
  expect(
    (BigInt(fixture.funding.availableKobo) * 1000000n) /
      BigInt(fixture.funding.rateKoboPerUsd),
  ).toBe(66000000n);
  for (const stock of fixture.stocks)
    expect(
      (BigInt(stock.quantityRaw) * BigInt(stock.unitPriceKobo)) /
        10n ** BigInt(stock.decimals),
    ).toBe(1000000n);
  expect(
    BigInt(fixture.strategy.lossExitKobo) -
      BigInt(fixture.strategy.initialPrincipalKobo),
  ).toBe(-200000n);
  expect(fixture.strategy.eligibleIncomeKobo).toBe("500000");
  expect(fixture.proceeds.minimumGrossKobo).toBe("200000");
});
