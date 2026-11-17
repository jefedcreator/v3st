import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appEarnService } from "@/backend/services/app/earn";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(await appEarnService.product(request.user!.id, request.params!.id), "Earn product");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
