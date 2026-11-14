import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { strategyService } from "@/backend/services/strategies";
import { idParamSchema } from "@/backend/validators/index.validator";
import { NotFoundException } from "@/utils/exceptions";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, PathParameters, null>(
  async (request) => {
    const operation = await strategyService.getOperation(request.user!.id, request.params!.id);
    if (!operation) throw new NotFoundException("Strategy operation not found", "NOT_FOUND");
    const res = ok(operation, "Strategy operation");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
