import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { strategyService } from "@/backend/services/strategies";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await strategyService.list(request.user!.id), "Strategies");
  },
  [authMiddleware],
);
