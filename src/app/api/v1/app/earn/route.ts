import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appEarnService } from "@/backend/services/app/earn";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appEarnService.products(request.user!.id), "Earn products");
  },
  [authMiddleware],
  { audience: "customer" },
);
