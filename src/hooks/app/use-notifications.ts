"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";

// The inbox, paged by cursor, plus the read/unread actions.
export function useNotificationsInfinite(enabled: boolean) {
  return useInfiniteQuery({
    enabled,
    queryKey: [...appKeys.notifications, "list"],
    queryFn: ({ pageParam }) => appApi.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return {
    markRead: async (ids: string[]) => {
      const res = await appApi.notifications.markRead({ ids });
      void queryClient.invalidateQueries({ queryKey: appKeys.session });
      void queryClient.invalidateQueries({ queryKey: [...appKeys.notifications, "list"] });
      return res;
    },
    markAllRead: async () => {
      const res = await appApi.notifications.markRead({ all: true });
      void queryClient.invalidateQueries({ queryKey: appKeys.session });
      void queryClient.invalidateQueries({ queryKey: [...appKeys.notifications, "list"] });
      return res;
    },
  };
}
