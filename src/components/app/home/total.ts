import { formatNaira, formatSignedNaira } from "@/utils/format";
import type { AppHomeDto } from "@/types/app";

// The total figure, its honesty note, and today's change line.
export function totalLines(home: AppHomeDto): {
  figure: string;
  note: string | null;
  change: string | null;
} {
  let figure: string;
  let note: string | null;
  if (home.total_kobo === null) {
    figure = "—";
    note = "Your total isn't available right now.";
  } else {
    figure = formatNaira(home.total_kobo);
    note = home.total_status === "partial" ? "Some prices are unavailable, so this total leaves them out." : null;
  }
  // A null change drops the line (spec §Home); zero is not a gain, so it
  // carries no sign.
  let change: string | null = null;
  if (home.change_24h_kobo !== null && home.total_kobo !== null) {
    const value = BigInt(home.change_24h_kobo);
    const text = value > 0n ? formatSignedNaira(home.change_24h_kobo, "in") : formatNaira(home.change_24h_kobo);
    change = `${text} today`;
  }
  return { figure, note, change };
}
