import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appHoldingsService } from "@/backend/services/app/holdings";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appHoldingsService.list(request.user!.id), "Holdings");
  },
  [authMiddleware],
  { audience: "customer" },
);
