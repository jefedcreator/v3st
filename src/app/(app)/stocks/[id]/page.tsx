import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppError } from "@/components/app/app-error";
import { StockPage } from "@/components/app/stocks/stock-page";
import { moneyLimits } from "@/server/app/limits";
import { readChart, readStock } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Stock · V3ST",
};

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCustomer(`/stocks/${id}`);
  const stock = await readStock(user, id);
  if (stock === undefined) notFound();
  if (stock === null) return <AppError />;
  const chart = await readChart(user, id, "1D");
  return <StockPage stock={stock} chart={chart} limits={moneyLimits()} />;
}
