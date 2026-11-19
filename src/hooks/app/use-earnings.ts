"use client";

import { useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";

export function useEarningsActions() {
  const queryClient = useQueryClient();
  return {
    setPreference: async (body: {
      choice: "payout" | "reinvest" | "unset";
      stock_id?: string;
      pin: string;
    }) => {
      const res = await appApi.earnings.setPreference(body);
      void queryClient.invalidateQueries({ queryKey: appKeys.earnings });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
      return res;
    },
  };
}
