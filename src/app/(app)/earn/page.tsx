import type { Metadata } from "next";

import { AppError } from "@/components/app/app-error";
import { EarnListPage } from "@/components/app/earn/earn-list-page";
import { readEarnings, readEarnProducts } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Earn · V3ST",
};

export default async function EarnListAppPage() {
  const user = await requireCustomer("/earn");
  const [products, earnings] = await Promise.all([
    readEarnProducts(user),
    readEarnings(user),
  ]);
  if (products === null || earnings === null) return <AppError />;
  return <EarnListPage products={products} earnings={earnings} />;
}
