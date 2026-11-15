import { Prisma } from "@/server/prisma";

export const RAW_MAX = 2n ** 256n - 1n;

export class RawAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RawAmountError";
  }
}

export function parseRaw(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new RawAmountError(
      `Not a canonical non-negative integer string: ${JSON.stringify(value)}`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > RAW_MAX) {
    throw new RawAmountError(`Raw quantity exceeds 2^256-1: ${value}`);
  }
  return parsed;
}

export function assertRaw(value: bigint): bigint {
  if (typeof value !== "bigint" || value < 0n || value > RAW_MAX) {
    throw new RawAmountError(`Raw quantity out of range 0..2^256-1: ${String(value)}`);
  }
  return value;
}

export function toDbRaw(value: bigint): Prisma.Decimal {
  return new Prisma.Decimal(assertRaw(value).toString());
}

// Performance is signed; ownership, allowances and cash remain unsigned.
export function toDbSignedRaw(value: bigint): Prisma.Decimal {
  if (value < -RAW_MAX || value > RAW_MAX) throw new RawAmountError("Signed amount exceeds uint256 magnitude");
  return new Prisma.Decimal(value.toString());
}

export function decimalTextToBigInt(text: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]\+?(\d+))?$/.exec(text);
  if (!match) {
    throw new RawAmountError(`Not a decimal integer string: ${JSON.stringify(text)}`);
  }
  const negative = match[1] === "-";
  const intPart = match[2]!;
  const fracPart = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  const allDigits = intPart + fracPart;
  const point = intPart.length + exponent;
  let digits: string;
  if (point >= allDigits.length) {
    digits = allDigits + "0".repeat(point - allDigits.length);
  } else {
    const remainingFraction = allDigits.slice(point);
    if (/[1-9]/.test(remainingFraction)) {
      throw new RawAmountError(`Fractional raw quantity: ${JSON.stringify(text)}`);
    }
    digits = allDigits.slice(0, Math.max(point, 1));
  }
  const magnitude = BigInt(digits);
  return negative ? -magnitude : magnitude;
}

export function fromDbRaw(value: Prisma.Decimal | string): bigint {
  const text = typeof value === "string" ? value : value.toFixed();
  return decimalTextToBigInt(text);
}

export function fromDbRawNullable(value: Prisma.Decimal | string | null): bigint | null {
  if (value === null) return null;
  return fromDbRaw(value);
}
