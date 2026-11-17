import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => ok(await appOnboardingService.status(request.user!.id), "Onboarding status"),
  [authMiddleware],
  { audience: "customer" },
);
