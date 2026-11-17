import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCatalogService } from "@/backend/services/app/catalog";
import {
  stockListQuerySchema,
  type StockListQuerySchema,
} from "@/backend/validators/app/catalog.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, StockListQuerySchema>(
  async (request) => {
    const items = await appCatalogService.list(request.user!.id, {
      query: request.query!.q,
      watchlist: request.query!.watchlist === "true",
    });
    return ok(items, "Stocks");
  },
  [authMiddleware, queryValidatorMiddleware(stockListQuerySchema)],
  { audience: "customer" },
);
