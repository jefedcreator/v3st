"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppActivityItemDto, AppActivityPageDto, AppHomeDto } from "@/types/app";
import { depositIdOf, isUnpaidTransfer } from "@/components/app/activity/activity-groups";

export function useHomeQuery(initial: AppHomeDto) {
  return useQuery({
    queryKey: [...appKeys.home],
    queryFn: () => appApi.home.get(),
    initialData: initial,
  });
}

export function useActivityPreviewQuery(initial: AppActivityPageDto) {
  return useQuery({
    queryKey: [...appKeys.activityPreview],
    queryFn: () => appApi.activity.list({ limit: 10 }),
    initialData: initial,
  });
}

// The deadlines of the unpaid transfers on the line, read from their deposits
// (usually none or one; the stream's cash area keeps them live).
export function useTransferDeadlines(items: AppActivityItemDto[]): Record<string, string> {
  const unpaid = items.filter(isUnpaidTransfer);
  const results = useQueries({
    queries: unpaid.map((item) => ({
      queryKey: [...appKeys.deposit(depositIdOf(item.id))],
      queryFn: () => appApi.cash.deposit(depositIdOf(item.id)),
    })),
  });
  const deadlines: Record<string, string> = {};
  unpaid.forEach((item, index) => {
    const expiresAt = results[index]?.data?.pay_to?.expires_at;
    if (expiresAt) deadlines[item.id] = expiresAt;
  });
  return deadlines;
}
