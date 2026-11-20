"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppChartDto, AppStockDetailDto, AppStockListItemDto, ChartRange } from "@/types/app";

export function useStocksQuery(
  q: { q?: string; watchlist?: boolean },
  initial?: AppStockListItemDto[],
) {
  return useQuery({
    queryKey: [...appKeys.stocks(q)],
    queryFn: () => appApi.stocks.list(q),
    initialData: initial,
  });
}

export function useStockQuery(id: string, initial: AppStockDetailDto) {
  return useQuery({
    queryKey: [...appKeys.stock(id)],
    queryFn: () => appApi.stocks.get(id),
    initialData: initial,
  });
}

export function useChartQuery(id: string, range: ChartRange, initial?: AppChartDto) {
  return useQuery({
    queryKey: [...appKeys.chart(id, range)],
    queryFn: () => appApi.stocks.chart(id, range),
    initialData: initial,
  });
}

// The watchlist star: optimistic and immediate.
export function useWatchlistButton(stock: AppStockDetailDto) {
  const queryClient = useQueryClient();
  return async (onWatchlist: boolean) => {
    const next = onWatchlist ? await appApi.watchlist.remove(stock.id) : await appApi.watchlist.add(stock.id);
    void queryClient.invalidateQueries({ queryKey: ["stocks"] });
    void queryClient.invalidateQueries({ queryKey: appKeys.stock(stock.id) });
    return next;
  };
}
