"use client";

import Link from "next/link";

import type { AppActivityPageDto, AppHomeDto } from "@/types/app";
import type { MoneyLimits } from "@/types/app-ui";
import { useOnboardingComplete } from "@/components/app/app-providers";
import { useHomeQuery, useActivityPreviewQuery } from "./use-home";
import { useNow } from "@/hooks/app/use-now";
import { buildMoneyLine } from "./line-model";
import { HoldingsList } from "./holdings-list";
import { MoneyLine } from "./money-line";
import { TotalBand } from "./total-band";

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
  const homeQuery = useHomeQuery(home);
  const activityQuery = useActivityPreviewQuery(activity);
  const now = useNow(60_000);
  const model = buildMoneyLine(homeQuery.data, activityQuery.data.items, now);

  return (
    <div className="flex flex-col gap-8">
      <TotalBand home={homeQuery.data} limits={limits} />
      <MoneyLine model={model} complete={complete} />
      <p>
        <Link href="/activity" className="text-gain text-[15px] underline-offset-4 hover:underline">
          See all activity
        </Link>
      </p>
      <HoldingsList home={homeQuery.data} />
    </div>
  );
}
