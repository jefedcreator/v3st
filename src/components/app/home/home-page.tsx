"use client";

import * as React from "react";

import type { AppActivityPageDto, AppHomeDto } from "@/types/app";
import type { MoneyLimits } from "@/types/app-ui";
import { useOnboardingComplete } from "@/components/app/app-providers";
import { AddMoneyDialog } from "@/components/app/cash/add-money-dialog";
import { useActivityPreviewQuery, useHomeQuery } from "@/hooks/app/use-home";
import { useNow } from "@/hooks/app/use-now";
import { buildMoneyLine } from "./line-model";
import { HoldingsList } from "./holdings-list";
import { MoneyLine } from "./money-line";
import { TotalBand } from "./total-band";

// Home: where your money stands (the total) and what is moving (the line),
// with your stocks under the fold. One Add money modal serves both pills.
export function HomePage({
  home,
  activity,
  limits,
}: {
  home: AppHomeDto;
  activity: AppActivityPageDto;
  limits: MoneyLimits;
}) {
  const complete = useOnboardingComplete();
  const { data: homeData } = useHomeQuery(home);
  const { data: activityData } = useActivityPreviewQuery(activity);
  const now = useNow(60_000);
  const [addOpen, setAddOpen] = React.useState(false);
  const model = buildMoneyLine(homeData, activityData.items, now);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Home</h1>
      <TotalBand home={homeData} onAddMoney={() => setAddOpen(true)} />
      <MoneyLine model={model} complete={complete} onAddMoney={() => setAddOpen(true)} />
      <HoldingsList home={homeData} />
      <AddMoneyDialog open={addOpen} onOpenChange={setAddOpen} limits={limits} />
    </div>
  );
}
