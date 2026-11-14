import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { stockService } from "@/backend/services/stocks";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async () => {
    return ok(await stockService.list(), "Stock catalog");
  },
  [authMiddleware],
);
