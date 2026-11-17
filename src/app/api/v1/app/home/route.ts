import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appHomeService } from "@/backend/services/app/home";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appHomeService.get(request.user!.id), "Home");
  },
  [authMiddleware],
  { audience: "customer" },
);
