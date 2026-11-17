import type { Stock } from "@/server/prisma";
import {
  referenceDisplay,
  tokenPriceMicroUsd,
} from "@/backend/services/stocks/reference";
import type { Rate } from "@/utils/money";

import { toKobo } from "./format";

export type DisplayValue = {
  valueMicroUsd: bigint | null;
  valueKobo: bigint | null;
  status: "live" | "delayed" | "unavailable";
  asOf: Date | null;
};

// Values a customer sees: floor(raw × token price / 10^decimals), in micro-USD and
// in kobo at the given (payout) rate. Unknown values are null, never zero.
export function displayValue(stock: Stock, raw: bigint, rate: Rate | null, at: Date): DisplayValue {
  const display = referenceDisplay(stock, at);
  const tokenPrice = tokenPriceMicroUsd(stock);
  if (!display || !rate || tokenPrice === null) {
    return {
      valueMicroUsd: null,
      valueKobo: null,
      status: "unavailable",
      asOf: display?.asOf ?? null,
    };
  }
  const valueMicroUsd = (raw * tokenPrice) / 10n ** BigInt(stock.decimals);
  return {
    valueMicroUsd,
    valueKobo: toKobo(valueMicroUsd, rate),
    status: display.status,
    asOf: display.asOf,
  };
}
