import {
  authMiddleware,
  pathParamValidatorMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCatalogService } from "@/backend/services/app/catalog";
import {
  chartQuerySchema,
  type ChartQuerySchema,
} from "@/backend/validators/app/catalog.validator";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, IdParamSchema, ChartQuerySchema>(
  async (request) => {
    const chart = await appCatalogService.chart(request.params!.id, request.query!.range);
    return ok(chart, "Chart");
  },
  [
    authMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    queryValidatorMiddleware(chartQuerySchema),
  ],
  { audience: "customer" },
);
