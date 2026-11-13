import type { ProviderMode } from "@/backend/integrations/beta-policy";

export type BetaDto = { stage: "beta"; mode: ProviderMode; test_funds_only: true };

export function betaDto(mode: ProviderMode): BetaDto {
  return { stage: "beta", mode, test_funds_only: true };
}
