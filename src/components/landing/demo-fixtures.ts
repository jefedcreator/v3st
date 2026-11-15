import type { LandingDemoFixture } from "./demo.types";

export const landingDemoFixture: LandingDemoFixture = {
  funding: {
    grossKobo: "10000000",
    feeKobo: "100000",
    availableKobo: "9900000",
    rateKoboPerUsd: "150000",
    settlementMicro: "66000000",
  },
  stocks: [
    {
      id: "TSTA",
      name: "Test Stock A",
      quantityRaw: "250000",
      decimals: 6,
      unitPriceKobo: "4000000",
      valueKobo: "1000000",
    },
    {
      id: "TSTB",
      name: "Test Stock B",
      quantityRaw: "1250000",
      decimals: 6,
      unitPriceKobo: "800000",
      valueKobo: "1000000",
    },
  ],
  strategy: {
    initialPrincipalKobo: "2000000",
    lossExitKobo: "1800000",
    lossKobo: "-200000",
    eligibleIncomeKobo: "500000",
  },
  proceeds: {
    qualifyingGrossKobo: "500000",
    belowMinimumGrossKobo: "199999",
    atMinimumGrossKobo: "200000",
    feeKobo: "10000",
    minimumGrossKobo: "200000",
  },
};
