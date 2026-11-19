"use client";

import Link from "next/link";
import { cn } from "@/utils/cn";

import type { AppStockListItemDto } from "@/types/app";
import { useNow } from "@/hooks/app/use-now";
import { Badge, Tabs, TabsList, TabsTrigger } from "@/primitives";
import { moneyText } from "@/primitives/money-text";
import { priceCaption, returnText, tradingChip } from "./price-status";
import { StockMark } from "./stock-mark";

// One row of the stock list.
export function StockRow({ stock, now }: { stock: AppStockListItemDto; now: Date }) {
  const chip = tradingChip(stock.trading);
  return (
    <Link
      href={`/stocks/${stock.id}`}
      className="flex min-h-11 items-center gap-3 border-b border-stroke py-3 transition-colors last:border-b-0 hover:bg-surface"
    >
      <StockMark logoPath={stock.logo_path} name={stock.name} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-ink truncate text-[15px]">{stock.name}</span>
        <span className="text-subtle text-[13px]">{stock.ticker}</span>
        <span className="text-subtle text-[13px]">
          {priceCaption(stock.price_status, stock.price_as_of, now)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-ink text-[15px] tabular-nums">{moneyText(stock.price_kobo)}</span>
        {stock.change_24h_bps !== null && (
          <span
            className={cn(
              "text-sm tabular-nums",
              stock.change_24h_bps < 0 ? "text-loss" : "text-gain",
            )}
          >
            {returnText(stock.change_24h_bps)}
          </span>
        )}
        {chip !== null && <Badge variant="secondary">{chip}</Badge>}
      </span>
    </Link>
  );
}

// The All / Watchlist switch, kept in the URL by the page.
export function ListTabs({
  watchlist,
  onChange,
}: {
  watchlist: boolean;
  onChange: (watchlist: boolean) => void;
}) {
  return (
    <Tabs
      value={watchlist ? "watchlist" : "all"}
      onValueChange={(value) => onChange(value === "watchlist")}
    >
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
