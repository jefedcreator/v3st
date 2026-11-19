import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appOrdersService } from "@/backend/services/app/orders";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(
      await appOrdersService.completeBetaTransfer(request.user!.id, request.params!.id),
      "Transfer marked as paid",
    );
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
