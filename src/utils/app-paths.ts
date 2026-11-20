import type { AppOnboardingStepKey } from "@/types/app";

// A trusted redirect target on this site: a path, never an auth or API path.
export function safeNext(next: string | null | undefined): string {
  if (next === null || next === undefined || next === "") return "/home";
  if (!next.startsWith("/")) return "/home";
  if (next.startsWith("//")) return "/home";
  if (next.startsWith("/\\")) return "/home";
  if (next === "/signin" || next.startsWith("/signin?")) return "/home";
  if (next.startsWith("/api/")) return "/home";
  return next;
}

// After sign-in: an unfinished setup claims the customer, whatever `next` said.
export function afterSignInPath(
  nextStep: AppOnboardingStepKey | null,
  next: string | null,
): string {
  if (nextStep !== null) return "/setup";
  return safeNext(next);
}

export const SETTINGS_MODALS = ["name", "bank", "pin", "reset-pin", "devices", "automations"] as const;

export type SettingsModal = (typeof SETTINGS_MODALS)[number];

export function parseSettingsOpen(value: string | string[] | undefined): SettingsModal | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) return null;
  for (const modal of SETTINGS_MODALS) {
    if (modal === first) return modal;
  }
  return null;
}

export function settingsHref(modal: SettingsModal): string {
  return `/settings?open=${modal}`;
}
