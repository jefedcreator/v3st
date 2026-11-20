import type { Metadata } from "next";

import { AppError } from "@/components/app/app-error";
import { CashPage } from "@/components/app/cash/cash-page";
import { moneyLimits } from "@/server/app/limits";
import { readCash } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Cash · V3ST",
};

export default async function CashAppPage() {
  const user = await requireCustomer("/cash");
  const read = await readCash(user);
  if (read === null) return <AppError />;
  return (
    <CashPage cash={read.cash} bankAccount={read.bankAccount} limits={moneyLimits()} />
  );
}
