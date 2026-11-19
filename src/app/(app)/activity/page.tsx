import type { Metadata } from "next";

import { AppError } from "@/components/app/app-error";
import { ActivityPage } from "@/components/app/activity/activity-page";
import { readActivity } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";

export const metadata: Metadata = {
  title: "Activity · V3ST",
};

export default async function ActivityListPage() {
  const user = await requireCustomer("/activity");
  const activity = await readActivity(user);
  if (activity === null) return <AppError />;
  return <ActivityPage initial={activity} />;
}
