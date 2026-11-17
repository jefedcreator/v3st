import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(await appCashService.getDeposit(request.user!.id, request.params!.id), "Deposit");
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
