import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { depositService } from "@/backend/services/deposits";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, PathParameters, null>(
  async (request) => {
    const id = request.params!.id;
    return ok(await depositService.get(request.user!.id, id), "Deposit");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
