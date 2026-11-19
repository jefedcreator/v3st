import type { Metadata } from "next";

import { AppError } from "@/components/app/app-error";
import { EarningsPage } from "@/components/app/earnings/earnings-page";
import { readEarnings } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Earnings · V3ST",
};

export default async function EarningsAppPage() {
  const user = await requireCustomer("/earnings");
  const earnings = await readEarnings(user);
  if (earnings === null) return <AppError />;
  return <EarningsPage earnings={earnings} />;
}
