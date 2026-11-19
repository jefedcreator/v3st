import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppError } from "@/components/app/app-error";
import { OrderPage } from "@/components/app/orders/order-page";
import { readOrder } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Order · V3ST",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCustomer(`/orders/${id}`);
  const order = await readOrder(user, id);
  if (order === undefined) notFound();
  if (order === null) return <AppError />;
  return <OrderPage order={order} />;
}
