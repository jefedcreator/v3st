import { formatLagosDay } from "@/utils/format";
import type { AppAutomationDto, AppProfileDto } from "@/types/app";

// The source is kept beside the backend's own pattern so the two cannot drift
// apart silently.
export const PREFERRED_NAME_SOURCE = "^[A-Za-z][A-Za-z' -]{0,39}$";

export function isValidPreferredName(name: string): boolean {
  return new RegExp(PREFERRED_NAME_SOURCE).test(name);
}

export function identityLine(p: AppProfileDto): string {
  if (!p.identity.verified) return "Not verified yet";
  if (p.identity.level === "higher") return "Verified · higher limits";
  return "Verified";
}

export function automationLine(a: AppAutomationDto): string {
  if (!a.active) return "Off";
  if (a.needs_renewal) return `Renew by ${formatLagosDay(a.expires_at)}`;
  return `On until ${formatLagosDay(a.expires_at)}`;
}
