"use client";

import Link from "next/link";
import { cn } from "@/utils/cn";

import type { AppHomeDto } from "@/types/app";
import { moneyText } from "@/primitives/money-text";
import { formatShares, formatNaira } from "@/utils/format";
import { priceCaption, returnText } from "@/components/app/stocks/price-status";
import { StockMark } from "@/components/app/stocks/stock-mark";
import { useNow } from "@/hooks/app/use-now";

// Your stocks, plus the Earn row when the customer has an Earn value.
export function HoldingsList({ home }: { home: AppHomeDto }) {
  const now = useNow(60_000);
  return (
    <section aria-label="Your stocks" className="flex flex-col gap-3 pt-4">
      <h2 className="type-app-heading text-heading">Your stocks</h2>
      {home.holdings.length === 0 && (
        <p className="text-muted-foreground text-sm">
          You don't have any stocks yet.{" "}
          <Link href="/stocks" className="text-gain underline-offset-4 hover:underline">
            Find a stock
          </Link>
        </p>
      )}
      {home.holdings.map((holding) => (
        <Link
          key={holding.id}
          href={`/stocks/${holding.id}`}
          className="flex min-h-11 items-center gap-3 border-b border-stroke py-3 transition-colors last:border-b-0 hover:bg-surface"
        >
          <StockMark logoPath={holding.logo_path} name={holding.name} size={40} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-ink truncate text-[15px]">{holding.name}</span>
            <span className="text-muted-foreground text-sm">{formatShares(holding.shares_micro)}</span>
            <span className="text-subtle text-[13px]">
              {priceCaption(holding.price_status, holding.price_as_of, now) ?? (holding.value_kobo === null ? "Price unavailable" : "")}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-ink text-[15px] tabular-nums">{moneyText(holding.value_kobo)}</span>
            <span
              className={cn(
                "text-sm tabular-nums",
                holding.return_bps === null
                  ? "text-subtle"
                  : holding.return_bps < 0
                    ? "text-loss"
                    : "text-gain",
              )}
            >
              {returnText(holding.return_bps) ?? ""}
            </span>
          </span>
        </Link>
      ))}
      {home.earn_kobo !== null && home.earn_kobo !== "0" && (
        <Link
          href="/earn"
          className="flex min-h-11 items-center justify-between gap-3 border-b border-stroke py-3 transition-colors last:border-b-0 hover:bg-surface"
        >
          <span className="text-ink text-[15px]">Earn</span>
          <span className="text-ink text-[15px] tabular-nums">{formatNaira(home.earn_kobo)}</span>
        </Link>
      )}
    </section>
  );
}
