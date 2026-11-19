import type { AppOnboardingDto, AppOnboardingStepDto } from "@/types/app";

// The current step as the API reports it, with its position in the list.
export function setupProgress(
  o: AppOnboardingDto,
): { current: AppOnboardingStepDto | null; index: number; total: number } {
  const current = o.steps.find((step) => step.key === o.next_step) ?? null;
  return {
    current,
    index: current === null ? o.steps.length : o.steps.indexOf(current),
    total: o.steps.length,
  };
}
