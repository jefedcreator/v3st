"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppActivityPageDto } from "@/types/app";

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
