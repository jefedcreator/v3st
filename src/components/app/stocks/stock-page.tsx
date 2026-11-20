"use client";

import Link from "next/link";
import * as React from "react";

import { cn } from "@/utils/cn";
import type { AppChartDto, AppStockDetailDto, ChartRange } from "@/types/app";
import type { MoneyLimits } from "@/types/app-ui";
import { formatChangeBps, formatShares } from "@/utils/format";
import { useNow } from "@/hooks/app/use-now";
import { useChartQuery, useStockQuery } from "@/hooks/app/use-stocks";
import { moneyText } from "@/primitives/money-text";
import { Button } from "@/primitives";
import { PageHeader } from "@/components/app/page-header";
import { DocumentDialog } from "@/components/app/documents/document-dialog";
import { SetupGate } from "@/components/app/setup-gate";
import { TradeDialog } from "@/components/app/trade/trade-dialog";
import { PriceChart } from "./price-chart";
import { priceCaption } from "./price-status";
import { StockMark } from "./stock-mark";
import { WatchlistButton } from "./watchlist-button";

// Understand one stock: price, chart, position, actions and about. Buy and
// Sell open the trade modal; trading paused disables both.
export function StockPage({
  stock: initial,
  chart: initialChart,
  limits,
}: {
  stock: AppStockDetailDto;
  chart: AppChartDto | null;
  limits: MoneyLimits;
}) {
  const now = useNow(60_000);
  const { data: stock } = useStockQuery(initial.id, initial);
  const [range, setRange] = React.useState<ChartRange>("1D");
  const chartQuery = useChartQuery(
    stock.id,
    range,
    range === "1D" ? (initialChart ?? undefined) : undefined,
  );
  const [documentOpen, setDocumentOpen] = React.useState(false);

  const caption = priceCaption(stock.price_status, stock.price_as_of, now);
  const paused = stock.trading === "paused";
  const updating = stock.trading === "prices_updating";
  const [trade, setTrade] = React.useState<"buy" | "sell" | null>(null);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        title={stock.name}
        back={{ href: "/stocks", label: "Stocks" }}
        actions={<WatchlistButton stock={stock} />}
      />
      <div className="flex items-center gap-3">
        <StockMark logoPath={stock.logo_path} name={stock.name} size={48} />
        <p className="text-subtle text-sm">{stock.ticker}</p>
      </div>
      <section aria-label="Price" className="flex flex-col gap-1">
        <p className="type-app-figure text-heading">{moneyText(stock.price_kobo)}</p>
        {stock.change_24h_bps !== null && (
          <p
            className={cn(
              "text-sm tabular-nums",
              stock.change_24h_bps < 0 ? "text-loss" : "text-gain",
            )}
          >
            {formatChangeBps(stock.change_24h_bps)}
          </p>
        )}
        {caption !== null && <p className="text-subtle text-sm">{caption}</p>}
      </section>
      <PriceChart range={range} chart={chartQuery.data ?? null} onRangeChange={setRange} />
      <section aria-label="Your position" className="flex flex-col gap-1">
        <h2 className="type-app-heading text-heading">Your position</h2>
        {stock.your_position === null ? (
          <p className="text-muted-foreground text-sm">No shares yet.</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {formatShares(stock.your_position.shares_micro)} · {moneyText(stock.your_position.value_kobo)}
          </p>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <SetupGate label="Finish setting up to invest">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={paused} onClick={() => setTrade("buy")}>
              Buy
            </Button>
            {stock.your_position !== null && (
              <Button variant="outline" disabled={paused} onClick={() => setTrade("sell")}>
                Sell
              </Button>
            )}
          </div>
        </SetupGate>
        {paused && (
          <p className="text-muted-foreground text-sm">
            Trading is paused for a short time. Your money is safe.
          </p>
        )}
        {updating && (
          <p className="text-muted-foreground text-sm">
            Prices are updating. Your order goes through when they do.
          </p>
        )}
      </div>
      <section aria-label="About" className="flex flex-col gap-1">
        <h2 className="type-app-heading text-heading">About</h2>
        <p className="text-muted-foreground text-[15px]">{stock.summary}</p>
        <p>
          <button
            type="button"
            className="text-gain text-[15px] underline-offset-4 hover:underline"
            onClick={() => setDocumentOpen(true)}
          >
            How your shares are held
          </button>
        </p>
        {stock.earn_product_id !== null && (
          <p>
            <Link
              href={`/earn/${stock.earn_product_id}`}
              className="text-gain text-[15px] underline-offset-4 hover:underline"
            >
              Earn from {stock.name} trading fees
            </Link>
          </p>
        )}
      </section>
      <DocumentDialog
        slug="how-shares-are-held"
        open={documentOpen}
        onOpenChange={setDocumentOpen}
      />
      {trade !== null && (
        <TradeDialog
          open
          onOpenChange={(open) => {
            if (!open) setTrade(null);
          }}
          side={trade}
          stock={stock}
          minKobo={limits.buyMinKobo}
        />
      )}
    </div>
  );
}
