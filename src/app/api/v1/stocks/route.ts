import {
  authMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { stockService } from "@/backend/services/stocks";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async () => {
    return ok(await stockService.list(), "Stock catalog");
  },
  [authMiddleware],
);
