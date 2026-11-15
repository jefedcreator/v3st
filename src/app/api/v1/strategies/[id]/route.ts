import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { strategyService } from "@/backend/services/strategies";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, PathParameters, null>(
  async (request) => {
    return ok(await strategyService.get(request.user!.id, request.params!.id), "Strategy");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
