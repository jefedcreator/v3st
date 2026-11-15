import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { investmentService } from "@/backend/services/investments";
import { idParamSchema } from "@/backend/validators/index.validator";
import { NotFoundException } from "@/utils/exceptions";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, PathParameters, null>(
  async (request) => {
    const investment = await investmentService.get(request.user!.id, request.params!.id);
    if (!investment) throw new NotFoundException("Investment not found", "NOT_FOUND");
    const res = ok(investment, "Investment");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
