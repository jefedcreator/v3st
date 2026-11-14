export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyFormatError";
  }
}

export const MAX_MINOR = 9_223_372_036_854_775_807n;

export type Rate = { kobo: bigint; microUsd: bigint };

export function parseMinor(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new MoneyFormatError(`Not a canonical non-negative integer string: ${JSON.stringify(value)}`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_MINOR) {
    throw new MoneyFormatError(`Minor amount exceeds MAX_MINOR: ${value}`);
  }
  return parsed;
}

export function formatMinor(value: bigint): string {
  return value.toString();
}

export function decimalToMinor(value: string, decimals: number, rounding: "floor" | "exact"): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new MoneyFormatError(`Not a non-negative decimal string: ${JSON.stringify(value)}`);
  }
  const intPart = match[1] ?? "0";
  const fracPart = match[2] ?? "";
  if (fracPart.length > decimals) {
    if (rounding === "exact") {
      throw new MoneyFormatError(`More than ${decimals} decimal places: ${JSON.stringify(value)}`);
    }
  }
  const scale = 10n ** BigInt(decimals);
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * scale + BigInt(frac === "" ? "0" : frac);
}

export function minorToProviderNumber(value: bigint, decimals: number): number {
  if (value >= 2n ** 53n) {
    throw new MoneyFormatError(`Minor amount too large for a provider float: ${value}`);
  }
  return Number(value) / 10 ** decimals;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rateFromNgnPerUsd(value: string): Rate {
  const koboPerUsd = decimalToMinor(value, 2, "exact");
  if (koboPerUsd <= 0n) {
    throw new MoneyFormatError(`Rate must be positive: ${JSON.stringify(value)}`);
  }
  const microUsd = 1_000_000n;
  const divisor = gcd(koboPerUsd, microUsd);
  return { kobo: koboPerUsd / divisor, microUsd: microUsd / divisor };
}

function divRound(numerator: bigint, denominator: bigint, rounding: "floor" | "ceil"): bigint {
  if (rounding === "floor") return numerator / denominator;
  return (numerator + denominator - 1n) / denominator;
}

export function ngnToUsd(kobo: bigint, rate: Rate, rounding: "floor" | "ceil"): bigint {
  return divRound(kobo * rate.microUsd, rate.kobo, rounding);
}

export function usdToNgn(microUsd: bigint, rate: Rate, rounding: "floor" | "ceil"): bigint {
  return divRound(microUsd * rate.kobo, rate.microUsd, rounding);
}

export function rateToDto(rate: Rate): { kobo: string; micro_usd: string; ngn_per_usd: string } {
  const koboPerUsd = (rate.kobo * 1_000_000n) / rate.microUsd;
  const whole = koboPerUsd / 100n;
  const frac = koboPerUsd % 100n;
  return {
    kobo: rate.kobo.toString(),
    micro_usd: rate.microUsd.toString(),
    ngn_per_usd: `${whole.toString()}.${frac.toString().padStart(2, "0")}`,
  };
}

type ReviverContext = { source: string };

type JsonReviver = (this: unknown, key: string, value: unknown, context?: ReviverContext) => unknown;

export function parseProviderJson(text: string): unknown {
  const reviver: JsonReviver = (_key, value, context) => {
    if (typeof value === "number" && context !== undefined) {
      return context.source;
    }
    return value;
  };
  return JSON.parse(text, reviver);
}
