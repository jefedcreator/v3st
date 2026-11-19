"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { AppStockListItemDto } from "@/types/app";
import { useNow } from "@/hooks/app/use-now";
import { useStocksQuery } from "@/hooks/app/use-stocks";
import { Input, Label } from "@/primitives";
import { ListTabs, StockRow } from "./stock-row";

// Find a stock: search plus the All / Watchlist switch, both in the URL.
export function StocksPage({
  q,
  watchlist,
  initial,
}: {
  q: string;
  watchlist: boolean;
  initial?: AppStockListItemDto[];
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const [text, setText] = React.useState(q);
  const [debounced, setDebounced] = React.useState(q);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(text);
      writeUrl(text, watchlist);
    }, 250);
    return () => clearTimeout(timer);
  }, [text, watchlist]);

  function writeUrl(nextQ: string, nextWatchlist: boolean) {
    const params = new URLSearchParams();
    if (nextQ !== "") params.set("q", nextQ);
    if (nextWatchlist) params.set("watchlist", "true");
    const suffix = params.toString() === "" ? "" : `?${params.toString()}`;
    window.history.replaceState(null, "", `/stocks${suffix}`);
    void router;
  }

  const { data } = useStocksQuery(
    { q: debounced === "" ? undefined : debounced, watchlist: watchlist || undefined },
    initial,
  );

  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="type-app-title text-heading">Stocks</h1>
      <div className="flex flex-col gap-2">
        <Label htmlFor="stock-search">Search stocks</Label>
        <Input
          id="stock-search"
          type="search"
          placeholder="Apple, NVIDIA…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <ListTabs
          watchlist={watchlist}
          onChange={(next) => {
            writeUrl(debounced, next);
            router.replace(`/stocks${next ? "?watchlist=true" : ""}`);
          }}
        />
        <p className="text-subtle text-[13px]">Beta prices in naira</p>
      </div>
      <div className="flex flex-col">
        {(data ?? []).map((stock) => (
          <StockRow key={stock.id} stock={stock} now={now} />
        ))}
        {(data ?? []).length === 0 && debounced !== "" && (
          <p className="text-muted-foreground py-6 text-sm">No stocks match "{debounced}".</p>
        )}
        {(data ?? []).length === 0 && debounced === "" && watchlist && (
          <p className="text-muted-foreground py-6 text-sm">
            Your watchlist is empty. Tap the star on a stock to add it.
          </p>
        )}
      </div>
    </div>
  );
}
