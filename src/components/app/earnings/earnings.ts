import type { AppEarningsDto, AppEarningsWeekDto } from "@/types/app";
import { formatNaira } from "@/utils/format";

export function outcomeLabel(o: AppEarningsWeekDto["outcome"]): string {
  switch (o) {
    case "pending":
      return "Pending";
    case "paid":
      return "Paid to your bank";
    case "reinvested":
      return "Reinvested";
    case "rolled_over":
      return "Rolled over";
    case "mixed":
      return "Part paid, part reinvested";
  }
}

export function choiceLine(e: AppEarningsDto): string | null {
  if (e.choice === "payout") return "Paid to your bank on Fridays";
  if (e.choice === "reinvest") {
    const name = e.reinvest_stock?.name ?? "a stock";
    return `Reinvested in ${name}`;
  }
  return null;
}

export function minimumPayoutLine(kobo: string): string {
  return `Payouts start at ${formatNaira(kobo)}. Smaller amounts roll over to the next week.`;
}
