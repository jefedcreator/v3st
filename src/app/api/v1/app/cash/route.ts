import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appCashService.balance(request.user!.id), "Cash balance");
  },
  [authMiddleware],
  { audience: "customer" },
);
