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

export const GET = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(await appOrdersService.get(request.user!.id, request.params!.id), "Order");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);

export const DELETE = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(await appOrdersService.cancel(request.user!.id, request.params!.id), "Order cancelled");
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
