export type DemoStage = "funding" | "stocks" | "strategies" | "proceeds";
export type DemoScenario =
  | "eligible"
  | "zero_income"
  | "principal_loss"
  | "below_minimum"
  | "at_minimum";
export type LandingDemoFixture = {
  funding: {
    grossKobo: string;
    feeKobo: string;
    availableKobo: string;
    rateKoboPerUsd: string;
    settlementMicro: string;
  };
  stocks: readonly {
    id: "TSTA" | "TSTB";
    name: string;
    quantityRaw: string;
    decimals: number;
    unitPriceKobo: string;
    valueKobo: string;
  }[];
  strategy: {
    initialPrincipalKobo: string;
    lossExitKobo: string;
    lossKobo: string;
    eligibleIncomeKobo: string;
  };
  proceeds: {
    qualifyingGrossKobo: string;
    belowMinimumGrossKobo: string;
    atMinimumGrossKobo: string;
    feeKobo: string;
    minimumGrossKobo: string;
  };
};
