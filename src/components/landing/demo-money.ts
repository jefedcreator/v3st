export class DemoMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoMoneyError";
  }
}

export const MINIMUM_GROSS_KOBO = "200000";
export const EXAMPLE_PAYOUT_FEE_KOBO = "10000";

const CANONICAL_INTEGER = /^-?(0|[1-9]\d*)$/;
const CANONICAL_UNSIGNED = /^(0|[1-9]\d*)$/;

export function formatNgn(kobo: string): string {
  if (!CANONICAL_INTEGER.test(kobo)) {
    throw new DemoMoneyError(
      `Not a canonical integer string: ${JSON.stringify(kobo)}`,
    );
  }
  const negative = kobo.startsWith("-");
  const digits = negative ? kobo.slice(1) : kobo;
  const value = BigInt(digits);
  const whole = value / 100n;
  const frac = value % 100n;
  const grouped = whole
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "\u2212" : "";
  if (frac === 0n) {
    return `${sign}\u20a6${grouped}`;
  }
  return `${sign}\u20a6${grouped}.${frac.toString().padStart(2, "0")}`;
}

export function formatUnits(raw: string, decimals: number): string {
  if (!CANONICAL_UNSIGNED.test(raw)) {
    throw new DemoMoneyError(
      `Not a canonical non-negative integer string: ${JSON.stringify(raw)}`,
    );
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new DemoMoneyError(`Invalid decimal count: ${decimals}`);
  }
  const scale = 10n ** BigInt(decimals);
  const value = BigInt(raw);
  const whole = value / scale;
  const frac = value % scale;
  if (decimals === 0 || frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  if (fracStr === "") {
    return whole.toString();
  }
  return `${whole.toString()}.${fracStr}`;
}

export type PayoutPreview = {
  status: "rollover" | "qualifies";
  grossKobo: string;
  feeKobo: string;
  receivedKobo: string;
  rolloverKobo: string;
};

export function payoutPreview(grossKobo: string): PayoutPreview {
  if (!CANONICAL_UNSIGNED.test(grossKobo)) {
    throw new DemoMoneyError(
      `Not a canonical non-negative integer string: ${JSON.stringify(grossKobo)}`,
    );
  }
  const gross = BigInt(grossKobo);
  if (gross < BigInt(MINIMUM_GROSS_KOBO)) {
    return {
      status: "rollover",
      grossKobo,
      feeKobo: "0",
      receivedKobo: "0",
      rolloverKobo: grossKobo,
    };
  }
  const fee = BigInt(EXAMPLE_PAYOUT_FEE_KOBO);
  return {
    status: "qualifies",
    grossKobo,
    feeKobo: fee.toString(),
    receivedKobo: (gross - fee).toString(),
    rolloverKobo: "0",
  };
}

export function fxSettlementMicro(
  availableKobo: string,
  rateKoboPerUsd: string,
): string {
  if (!CANONICAL_UNSIGNED.test(availableKobo)) {
    throw new DemoMoneyError(`Invalid available kobo: ${availableKobo}`);
  }
  if (!CANONICAL_UNSIGNED.test(rateKoboPerUsd) || BigInt(rateKoboPerUsd) === 0n) {
    throw new DemoMoneyError(`Invalid rate: ${rateKoboPerUsd}`);
  }
  return (BigInt(availableKobo) * 1_000_000n / BigInt(rateKoboPerUsd)).toString();
}
