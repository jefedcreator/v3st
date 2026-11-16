import { describe, expect, it } from "vitest";

import { landingDemoFixture } from "@/components/landing/demo-fixtures";
import { formatNgn, formatUnits, payoutPreview } from "@/components/landing/demo-money";

describe("landingDemoFixture", () => {
  it("funding example: available = gross - fee and exact FX settlement", () => {
    const { funding } = landingDemoFixture;
    expect(BigInt(funding.grossKobo) - BigInt(funding.feeKobo)).toBe(
      BigInt(funding.availableKobo),
    );
    expect(formatNgn(funding.grossKobo)).toBe("\u20a6100,000");
    expect(formatNgn(funding.feeKobo)).toBe("\u20a61,000");
    expect(formatNgn(funding.availableKobo)).toBe("\u20a699,000");
    expect(funding.rateKoboPerUsd).toBe("150000");
    expect(funding.settlementMicro).toBe("66000000");
    expect(
      BigInt(funding.availableKobo) * 1_000_000n / BigInt(funding.rateKoboPerUsd),
    ).toBe(BigInt(funding.settlementMicro));
  });

  it("both fictional stock examples value to 1000000 kobo", () => {
    for (const stock of landingDemoFixture.stocks) {
      const units = formatUnits(stock.quantityRaw, stock.decimals);
      const expected =
        (BigInt(stock.quantityRaw) * BigInt(stock.unitPriceKobo)) /
        10n ** BigInt(stock.decimals);
      expect(expected).toBe(BigInt(stock.valueKobo));
      expect(stock.valueKobo).toBe("1000000");
      expect(formatNgn(stock.valueKobo)).toBe("\u20a610,000");
      expect(units === "0.25" || units === "1.25").toBe(true);
    }
  });

  it("strategy loss example is -200000 kobo and not income", () => {
    const { strategy } = landingDemoFixture;
    expect(
      BigInt(strategy.lossExitKobo) - BigInt(strategy.initialPrincipalKobo),
    ).toBe(BigInt(strategy.lossKobo));
    expect(strategy.lossKobo).toBe("-200000");
    expect(formatNgn(strategy.lossKobo)).toBe("\u2212\u20a62,000");
    expect(strategy.eligibleIncomeKobo).toBe("500000");
  });

  it("proceeds scenarios match the payout rules", () => {
    const { proceeds } = landingDemoFixture;
    expect(payoutPreview(proceeds.belowMinimumGrossKobo).status).toBe("rollover");
    expect(payoutPreview(proceeds.atMinimumGrossKobo).receivedKobo).toBe("190000");
    expect(payoutPreview(proceeds.qualifyingGrossKobo).receivedKobo).toBe("490000");
    expect(proceeds.feeKobo).toBe("10000");
    expect(proceeds.minimumGrossKobo).toBe("200000");
  });
});
