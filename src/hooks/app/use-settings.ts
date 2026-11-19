"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type {
  AppAutomationDto,
  AppBankDto,
  AppDeviceSessionDto,
  AppProfileDto,
} from "@/types/app";

export function useProfileQuery(initial: AppProfileDto) {
  return useQuery({
    queryKey: [...appKeys.profile],
    queryFn: () => appApi.profile.get(),
    initialData: initial,
  });
}

export function useAutomationsQuery(initial: AppAutomationDto[]) {
  return useQuery({
    queryKey: [...appKeys.automations],
    queryFn: () => appApi.automations.list(),
    initialData: initial,
  });
}

export function useDevicesQuery() {
  return useQuery({
    queryKey: [...appKeys.devices],
    queryFn: () => appApi.security.sessions(),
  });
}

export function useSettingsActions() {
  const queryClient = useQueryClient();

  function invalidate(keys: (readonly unknown[])[]) {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  async function updateName(name: string | null): Promise<AppProfileDto> {
    const profile = await appApi.profile.update({ preferred_name: name });
    invalidate([appKeys.profile, appKeys.session]);
    return profile;
  }

  async function putBankAccount(body: {
    bank_code: string;
    account_number: string;
    pin: string;
  }) {
    const account = await appApi.bankAccount.put(body);
    invalidate([appKeys.profile, appKeys.bankAccount, appKeys.home]);
    return account;
  }

  async function setPin(body: { pin: string; current_pin?: string }) {
    const res = await appApi.security.setPin(body);
    return res;
  }

  async function revokeSession(id: string) {
    await appApi.security.revokeSession(id);
    invalidate([appKeys.devices, appKeys.session]);
  }

  async function signOutOthers() {
    await appApi.security.signOutOthers();
    invalidate([appKeys.devices, appKeys.session]);
  }

  async function turnOffAutomation(id: string) {
    await appApi.automations.turnOff(id);
    invalidate([appKeys.automations, appKeys.home]);
  }

  async function renewAutomation(id: string, pin: string) {
    await appApi.automations.renew(id, pin);
    invalidate([appKeys.automations, appKeys.home]);
  }

  return {
    updateName,
    putBankAccount,
    setPin,
    revokeSession,
    signOutOthers,
    turnOffAutomation,
    renewAutomation,
  };
}

export function useBanksQuery(initial: AppBankDto[]) {
  return useQuery({
    queryKey: [...appKeys.banks],
    queryFn: () => appApi.banks.list(),
    initialData: initial,
  });
}

export { AppApiError };
export type { AppDeviceSessionDto };
