import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { withdrawalService } from "@/backend/services/withdrawals";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, PathParameters, null>(
  async (request) => {
    const id = request.params!.id;
    return ok(await withdrawalService.get(request.user!.id, id), "Withdrawal");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
