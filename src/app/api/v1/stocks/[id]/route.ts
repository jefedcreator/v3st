import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { stockService } from "@/backend/services/stocks";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, PathParameters, null>(
  async (request) => {
    const stock = await stockService.getDto(request.params!.id);
    const res = ok(stock, "Stock details");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
