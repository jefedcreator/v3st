import type { Metadata } from "next";

import { AppError } from "@/components/app/app-error";
import { HomePage } from "@/components/app/home/home-page";
import { moneyLimits } from "@/server/app/limits";
import { readHome } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Home · V3ST",
};

export default async function HomeAppPage() {
  const user = await requireCustomer("/home");
  const read = await readHome(user);
  if (read === null) return <AppError />;
  return (
    <HomePage home={read.home} activity={read.activity} limits={moneyLimits()} />
  );
}
