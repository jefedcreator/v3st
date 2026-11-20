"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppEarnProductDto, AppEarningsDto } from "@/types/app";

export function useEarnProductsQuery(initial?: AppEarnProductDto[]) {
  return useQuery({
    queryKey: [...appKeys.earnProducts],
    queryFn: () => appApi.earn.list(),
    initialData: initial,
  });
}

export function useEarnProductQuery(id: string, initial: AppEarnProductDto) {
  return useQuery({
    queryKey: [...appKeys.earnProduct(id)],
    queryFn: () => appApi.earn.get(id),
    initialData: initial,
  });
}

export function useEarningsQuery(initial: AppEarningsDto) {
  return useQuery({
    queryKey: [...appKeys.earnings],
    queryFn: () => appApi.earnings.get(),
    initialData: initial,
  });
}

export function useEarnActions() {
  const queryClient = useQueryClient();
  return {
    afterJoin: () => {
      void queryClient.invalidateQueries({ queryKey: appKeys.earnProducts });
      void queryClient.invalidateQueries({ queryKey: ["earn"] });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
    },
    afterLeave: () => {
      void queryClient.invalidateQueries({ queryKey: appKeys.earnProducts });
      void queryClient.invalidateQueries({ queryKey: ["earn"] });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
    },
  };
}
