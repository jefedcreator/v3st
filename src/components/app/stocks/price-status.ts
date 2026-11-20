import { formatChangeBps, formatLagosDay, formatLagosTime } from "@/utils/format";
import type { AppPriceStatus, AppTrading } from "@/types/app";

const lagosDay = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    typeof value === "string" ? new Date(value) : value,
  );

// How a price's honesty shows: live says nothing, delayed says when, and
// unavailable says so.
export function priceCaption(
  status: AppPriceStatus,
  asOf: string | null,
  now: Date,
): string | null {
  if (status === "live") return null;
  if (asOf === null) return "Price unavailable";
  if (status === "delayed") {
    const sameDay = lagosDay(asOf) === lagosDay(now);
    if (sameDay) return `Delayed · ${formatLagosTime(asOf)}`;
    return `Delayed · ${formatLagosDay(asOf)}, ${formatLagosTime(asOf)}`;
  }
  return "Price unavailable";
}

export function tradingChip(trading: AppTrading): string | null {
  if (trading === "prices_updating") return "Prices updating";
  if (trading === "paused") return "Trading paused";
  return null;
}

export function returnText(bps: number | null): string | null {
  if (bps === null) return null;
  return formatChangeBps(bps);
}
