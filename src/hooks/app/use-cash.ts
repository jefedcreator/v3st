"use client";

import { useQuery } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppBankAccountDto, AppCashDto } from "@/types/app";

export function useCashQuery(initial?: AppCashDto) {
  return useQuery({
    queryKey: [...appKeys.cash],
    queryFn: () => appApi.cash.get(),
    initialData: initial,
  });
}

export function useBankAccountQuery(initial?: AppBankAccountDto | null) {
  return useQuery({
    queryKey: [...appKeys.bankAccount],
    queryFn: () => appApi.bankAccount.get(),
    initialData: initial,
  });
}
