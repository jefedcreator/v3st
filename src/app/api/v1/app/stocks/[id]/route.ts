import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCatalogService } from "@/backend/services/app/catalog";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    const stock = await appCatalogService.get(request.user!.id, request.params!.id);
    return ok(stock, "Stock");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
