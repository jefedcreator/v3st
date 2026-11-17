import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async () => {
    return ok(await appCashService.banks(), "Banks");
  },
  [authMiddleware],
  { audience: "customer" },
);
