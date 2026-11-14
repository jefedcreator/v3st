import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { depositService } from "@/backend/services/deposits";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async (request) => {
    const id = request.params!.id!;
    return ok(await depositService.get(request.user!.id, id), "Deposit");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
