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
import { db } from "@/server/db";
import { accepted, ok } from "@/utils/response";

export const POST = withMiddleware<StrategyConfirmBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const key = request.idempotencyKey!;
    // Replaying the same idempotency key returns the one created operation (200).
    const existing = await db.onchainOperation.findUnique({ where: { key: `strat-op:${key}` } });
    if (existing?.userId === request.user!.id) {
      const dto = await strategyService.getOperation(request.user!.id, existing.id);
      return ok(dto, "Strategy operation", 200);
    }
    const operation = await strategyService.confirm(
      request.user!.id,
      body.quote_id,
      body.authorization_id,
      key,
    );
    const res = accepted(operation, "Strategy operation accepted");
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
