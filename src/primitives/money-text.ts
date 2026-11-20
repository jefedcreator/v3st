import { formatNaira, formatSignedNaira } from "@/utils/format";

// Unknown money renders as an em dash, never ₦0. A direction signs it.
export function moneyText(kobo: string | null, direction: "in" | "out" | "none" = "none"): string {
  if (kobo === null) return "—";
  if (direction === "none") return formatNaira(kobo);
  return formatSignedNaira(kobo, direction);
}
