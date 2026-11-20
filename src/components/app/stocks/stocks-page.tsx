"use client";

import * as React from "react";

import type { AppStockListItemDto } from "@/types/app";
import { useNow } from "@/hooks/app/use-now";
import { useStocksQuery } from "@/hooks/app/use-stocks";
import { Input, Label, Skeleton } from "@/primitives";
import { ListTabs, StockRow } from "./stock-row";

// The URL keeps the search and the switch, written with replaceState so the
// page never re-renders on the server for a keystroke (as fluid does).
function writeUrl(q: string, watchlist: boolean) {
  const params = new URLSearchParams();
  if (q !== "") params.set("q", q);
  if (watchlist) params.set("watchlist", "true");
  const suffix = params.toString() === "" ? "" : `?${params.toString()}`;
  window.history.replaceState(window.history.state, "", `/stocks${suffix}`);
}

// Find a stock: search plus the All / Watchlist switch.
export function StocksPage({
  q,
  watchlist: initialWatchlist,
  initial,
}: {
  q: string;
  watchlist: boolean;
  initial?: AppStockListItemDto[];
}) {
  const now = useNow(60_000);
  const [text, setText] = React.useState(q);
  const [query, setQuery] = React.useState(q.trim());
  const [watchlist, setWatchlist] = React.useState(initialWatchlist);

  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  React.useEffect(() => {
    writeUrl(query, watchlist);
  }, [query, watchlist]);

  // The server's list belongs to the server's search only.
  const isInitialKey = query === q.trim() && watchlist === initialWatchlist;
  const { data, isPending, error } = useStocksQuery(
    { q: query === "" ? undefined : query, watchlist: watchlist || undefined },
    isInitialKey ? initial : undefined,
  );
  const stocks = data ?? [];

  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="type-app-title text-heading">Stocks</h1>
      <div className="flex flex-col gap-2">
        <Label htmlFor="stock-search">Search stocks</Label>
        <Input
          id="stock-search"
          type="search"
          placeholder="Apple, NVIDIA…"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ListTabs watchlist={watchlist} onChange={setWatchlist} />
        <p className="text-subtle text-[13px]">Beta prices in naira</p>
      </div>
      <div className="flex flex-col" aria-busy={isPending}>
        {isPending && (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {error !== null && stocks.length === 0 && (
          <p role="status" className="text-loss py-6 text-sm">
            {error.message}
          </p>
        )}
        {stocks.map((stock) => (
          <StockRow key={stock.id} stock={stock} now={now} />
        ))}
        {!isPending && error === null && stocks.length === 0 && query !== "" && (
          <p className="text-muted-foreground py-6 text-sm">No stocks match &quot;{query}&quot;.</p>
        )}
        {!isPending && error === null && stocks.length === 0 && query === "" && watchlist && (
          <p className="text-muted-foreground py-6 text-sm">
            Your watchlist is empty. Tap the star on a stock to add it.
          </p>
        )}
      </div>
    </div>
  );
}
