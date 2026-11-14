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

export function fromDbRaw(value: Prisma.Decimal | string): bigint {
  return BigInt(value.toString());
}

export function fromDbRawNullable(value: Prisma.Decimal | string | null): bigint | null {
  if (value === null) return null;
  return fromDbRaw(value);
}
