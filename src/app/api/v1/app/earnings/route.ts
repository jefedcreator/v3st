import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appEarningsService } from "@/backend/services/app/earnings";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appEarningsService.summary(request.user!.id), "Earnings");
  },
  [authMiddleware],
  { audience: "customer" },
);
