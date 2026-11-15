import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { strategyService } from "@/backend/services/strategies";
import {
  strategyConfirmBodySchema,
  type StrategyConfirmBodySchema,
} from "@/backend/validators/strategy.validator";
import { accepted, ok } from "@/utils/response";

export const POST = withMiddleware<StrategyConfirmBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const { dto, created } = await strategyService.confirmRequest(
      request.user!.id, body.quote_id, body.authorization_id, request.idempotencyKey!,
    );
    const res = created ? accepted(dto, "Accepted") : ok(dto, "Existing operation");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(strategyConfirmBodySchema),
  ],
);
