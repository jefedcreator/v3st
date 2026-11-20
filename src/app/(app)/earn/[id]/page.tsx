import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppError } from "@/components/app/app-error";
import { EarnProductPage } from "@/components/app/earn/earn-product-page";
import { readEarnProduct } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Earn · V3ST",
};

export default async function EarnProductAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCustomer(`/earn/${id}`);
  const product = await readEarnProduct(user, id);
  if (product === undefined) notFound();
  if (product === null) return <AppError />;
  return <EarnProductPage product={product} />;
}
