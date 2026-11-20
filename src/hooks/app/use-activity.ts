"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppActivityDetailDto, AppActivityPageDto, AppDepositDto } from "@/types/app";

// The activity feed, paged by cursor, with the server page as initial data.
export function useActivityList(initial?: AppActivityPageDto) {
  return useInfiniteQuery({
    queryKey: [...appKeys.activityList],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => appApi.activity.list({ cursor: pageParam }),
    initialData:
      initial === undefined
        ? undefined
        : { pages: [initial], pageParams: [undefined] },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

// One receipt, live: the stream's `activity` area invalidates it.
export function useActivityItemQuery(initial: AppActivityDetailDto) {
  return useQuery({
    queryKey: [...appKeys.activityItem(initial.id)],
    queryFn: () => appApi.activity.get(initial.id),
    initialData: initial,
  });
}

// An unpaid transfer's deposit, live: the stream's `cash` area invalidates it.
export function useDepositQuery(id: string | null, initial: AppDepositDto | null) {
  return useQuery({
    queryKey: [...appKeys.deposit(id ?? "none")],
    queryFn: () => appApi.cash.deposit(id ?? ""),
    initialData: initial ?? undefined,
    enabled: id !== null && initial !== null,
  });
}
