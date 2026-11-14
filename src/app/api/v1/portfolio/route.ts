import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { portfolioService } from "@/backend/services/portfolio";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const res = ok(await portfolioService.get(request.user!.id), "Portfolio");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware],
);
