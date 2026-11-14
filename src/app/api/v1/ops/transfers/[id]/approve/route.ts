import {
  authMiddleware,
  operatorMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { operationsService } from "@/backend/services/operations";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, PathParameters, null>(
  async (request) => {
    const transfer = await operationsService.approveTransfer(request.user!.id, request.params!.id);
    return ok(transfer, "Transfer approval recorded");
  },
  [authMiddleware, operatorMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
