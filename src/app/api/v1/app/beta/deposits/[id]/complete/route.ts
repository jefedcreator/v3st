import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(
      await appCashService.completeBetaDeposit(request.user!.id, request.params!.id),
      "Deposit updated",
    );
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
