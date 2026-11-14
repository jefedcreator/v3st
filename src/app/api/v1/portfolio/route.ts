import {
  authMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { portfolioService } from "@/backend/services/portfolio";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async (request) => {
    const res = ok(await portfolioService.get(request.user!.id), "Portfolio");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware],
);
