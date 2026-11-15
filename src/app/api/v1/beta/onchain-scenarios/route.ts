import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { onchainScenarioService } from "@/backend/services/scenarios";
import {
  onchainScenarioBodySchema,
  type OnchainScenarioBodySchema,
} from "@/backend/validators/onchain-scenario.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<OnchainScenarioBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const result = await onchainScenarioService.runOnchain(
      request.user!.id,
      { operation_id: body.operation_id, scenario: body.scenario },
      request.idempotencyKey!,
    );
    return ok(result, "Onchain scenario applied");
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(onchainScenarioBodySchema),
  ],
);
