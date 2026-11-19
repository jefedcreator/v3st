"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppOrderDto } from "@/types/app";

export function useOrderQuery(id: string, initial: AppOrderDto) {
  return useQuery({
    queryKey: [...appKeys.order(id)],
    queryFn: () => appApi.orders.get(id),
    initialData: initial,
  });
}

export function useOrderActions(id: string) {
  const queryClient = useQueryClient();
  return {
    cancel: async () => {
      const order = await appApi.orders.cancel(id);
      void queryClient.invalidateQueries({ queryKey: appKeys.order(id) });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
      return order;
    },
    completeTransfer: async () => {
      const order = await appApi.beta.completeOrderTransfer(id);
      void queryClient.invalidateQueries({ queryKey: appKeys.order(id) });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
      void queryClient.invalidateQueries({ queryKey: appKeys.cash });
      return order;
    },
  };
}
