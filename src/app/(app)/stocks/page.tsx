import type { Metadata } from "next";

import { AppError } from "@/components/app/app-error";
import { StocksPage } from "@/components/app/stocks/stocks-page";
import { readStocks } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Stocks · V3ST",
};

export default async function StocksListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; watchlist?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const watchlist = params.watchlist === "true";
  const user = await requireCustomer("/stocks");
  const stocks = await readStocks(user, {
    query: q === "" ? undefined : q,
    watchlist: watchlist || undefined,
  });
  if (stocks === null) return <AppError />;
  return <StocksPage q={q} watchlist={watchlist} initial={stocks} />;
}
