import { formatLagosDateTime, formatNaira } from "@/utils/format";
import type { AppOrderPreviewDto } from "@/types/app";

// One plain sentence per executes mode.
export function executesSentence(p: AppOrderPreviewDto): string {
  switch (p.executes) {
    case "now":
      return "Goes through now.";
    case "when_prices_update":
      return `Goes through when prices update, never above ${
        p.price_limit_kobo === null ? "—" : formatNaira(p.price_limit_kobo)
      }. Valid until ${
        p.order_valid_until === null ? "—" : formatLagosDateTime(p.order_valid_until)
      }.`;
    case "after_your_transfer":
      return "Goes through after your transfer arrives. You'll see the bank details next.";
  }
}

// Cash pays when it covers the amount; otherwise bank transfer.
export function defaultPayWith(
  availableKobo: string | null,
  amountKobo: string | null,
): "cash" | "bank_transfer" {
  if (availableKobo === null || amountKobo === null) return "bank_transfer";
  return BigInt(availableKobo) >= BigInt(amountKobo) ? "cash" : "bank_transfer";
}

export function previewExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function tradeTitle(side: "buy" | "sell", stockName: string): string {
  return `${side === "buy" ? "Buy" : "Sell"} ${stockName}`;
}
