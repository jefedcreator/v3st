"use client";

import * as React from "react";
import { Star } from "@phosphor-icons/react/dist/ssr";

import type { AppStockDetailDto } from "@/types/app";
import { useWatchlistButton } from "@/hooks/app/use-stocks";

// The watchlist star with aria-pressed.
export function WatchlistButton({ stock }: { stock: AppStockDetailDto }) {
  const toggle = useWatchlistButton(stock);
  const [onWatchlist, setOnWatchlist] = React.useState(stock.on_watchlist);
  const [pending, setPending] = React.useState(false);

  return (
    <button
      type="button"
      aria-pressed={onWatchlist}
      aria-label={onWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const next = await toggle(onWatchlist);
          setOnWatchlist(next.on_watchlist);
        } catch {
          // The star keeps its last known state; the list refetches on focus.
        } finally {
          setPending(false);
        }
      }}
      className="text-muted-foreground hover:text-heading focus-visible:outline-ring grid size-11 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 disabled:opacity-50"
    >
      <Star className="size-5" weight={onWatchlist ? "fill" : "regular"} aria-hidden="true" />
    </button>
  );
}
