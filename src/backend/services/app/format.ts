import { createHash } from "node:crypto";

import type { Rate } from "@/utils/money";

export function formatNaira(kobo: bigint): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const whole = abs / 100n;
  const fraction = abs % 100n;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionText = fraction === 0n ? "" : `.${fraction.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}₦${grouped}${fractionText}`;
}

export function formatShares(sharesMicro: bigint): string {
  const rounded = (sharesMicro + 50n) / 100n;
  const whole = rounded / 10_000n;
  const fraction = rounded % 10_000n;
  const fractionText = fraction.toString().padStart(4, "0").replace(/0+$/, "");
  const amount = fractionText === "" ? whole.toString() : `${whole.toString()}.${fractionText}`;
  return `${amount} ${whole === 1n && fraction === 0n ? "share" : "shares"}`;
}

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function customerReference(id: string): string {
  const digest = createHash("sha256").update(id).digest();
  let value = 0n;
  for (const byte of digest.subarray(0, 5)) {
    value = (value << 8n) | BigInt(byte);
  }
  const chars: string[] = [];
  for (let shift = 35; shift >= 0; shift -= 5) {
    chars.push(CROCKFORD_ALPHABET[Number((value >> BigInt(shift)) & 31n)]);
  }
  return `V3-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

export function firstNameOf(verifiedName: string | null): string | null {
  if (!verifiedName) return null;
  const first = verifiedName.trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function floorDiv(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder !== 0n && remainder < 0n !== denominator < 0n) return quotient - 1n;
  return quotient;
}

export function toKobo(microUsd: bigint, rate: Rate): bigint {
  return floorDiv(microUsd * rate.kobo, rate.microUsd);
}

export function sharesMicroOf(raw: bigint, decimals: number): bigint {
  return floorDiv(raw * 1_000_000n, 10n ** BigInt(decimals));
}
