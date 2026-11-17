import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appAutomationsService } from "@/backend/services/app/automations";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appAutomationsService.list(request.user!.id), "Automations");
  },
  [authMiddleware],
  { audience: "customer" },
);
