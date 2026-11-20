// Browser-only app types. These never import server code.

export type MoneyLimits = {
  depositMinKobo: string;
  depositMaxKobo: string;
  buyMinKobo: string;
  earnMinKobo: string;
  minPayoutKobo: string;
};

export type PrivyMode = "sandbox" | "simulated";
