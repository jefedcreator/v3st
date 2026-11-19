"use client";

import { useQuery } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppActivityPageDto, AppHomeDto } from "@/types/app";

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
