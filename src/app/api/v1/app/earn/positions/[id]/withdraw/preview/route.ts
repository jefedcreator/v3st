import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appEarnService } from "@/backend/services/app/earn";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(
      await appEarnService.withdrawPreview(request.user!.id, request.params!.id),
      "Withdraw preview",
    );
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
