import {
  authMiddleware,
  operatorMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { operationsService } from "@/backend/services/operations";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<unknown, QueryParameters>(
  async (request) => {
    await operationsService.refundHeldDeposit(request.user!.id, request.params!.id!);
    return ok({ refunded: true }, "Refund initiated");
  },
  [authMiddleware, operatorMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
