import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppError } from "@/components/app/app-error";
import { ReceiptPage } from "@/components/app/activity/receipt-page";
import { readActivityItem } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Receipt · V3ST",
};

export default async function ActivityItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCustomer(`/activity/${id}`);
  const detail = await readActivityItem(user, id);
  if (detail === undefined) notFound();
  if (detail === null) return <AppError />;
  return <ReceiptPage item={detail.item} deposit={detail.deposit} />;
}
