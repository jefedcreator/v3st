import { formatNaira } from "@/utils/format";

export type AmountCheck =
  | "empty"
  | "below_minimum"
  | "above_maximum"
  | "above_available"
  | "ok";

export function amountCheck(
  kobo: string | null,
  l: { minKobo?: string; maxKobo?: string; availableKobo?: string | null },
): AmountCheck {
  if (kobo === null) return "empty";
  const value = BigInt(kobo);
  if (l.minKobo !== undefined && value < BigInt(l.minKobo)) return "below_minimum";
  if (l.maxKobo !== undefined && value > BigInt(l.maxKobo)) return "above_maximum";
  if (l.availableKobo !== undefined && l.availableKobo !== null) {
    if (value > BigInt(l.availableKobo)) return "above_available";
  }
  return "ok";
}

export function amountMessage(
  check: AmountCheck,
  l: { minKobo?: string; maxKobo?: string },
): string | null {
  switch (check) {
    case "empty":
      return "Enter an amount.";
    case "below_minimum":
      return `The minimum is ${formatNaira(l.minKobo ?? "0")}.`;
    case "above_maximum":
      return `The most you can move at once is ${formatNaira(l.maxKobo ?? "0")}.`;
    case "above_available":
      return "That's more than your available cash.";
    case "ok":
      return null;
  }
}
