import {
  authMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { tradeService } from "@/backend/services/trades";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<unknown, Record<string, string>>(
  async (request) => {
    const id = request.params!.id!;
    const trade = await tradeService.retry(request.user!.id, id, request.idempotencyKey!);
    return ok(trade, "Trade retry accepted");
  },
  [
    authMiddleware,
    originMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    idempotencyKeyMiddleware,
  ],
);
