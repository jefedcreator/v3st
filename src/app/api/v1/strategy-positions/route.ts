import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { strategyService } from "@/backend/services/strategies";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const res = ok(await strategyService.positions(request.user!.id), "Strategy positions");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware],
);
