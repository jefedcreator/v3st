import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCatalogService } from "@/backend/services/app/catalog";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const PUT = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    await appCatalogService.watch(request.user!.id, request.params!.id);
    return ok({ on_watchlist: true }, "Added to watchlist");
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);

export const DELETE = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    await appCatalogService.unwatch(request.user!.id, request.params!.id);
    return ok({ on_watchlist: false }, "Removed from watchlist");
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
