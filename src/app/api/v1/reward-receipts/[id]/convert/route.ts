import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { authorizationService } from "@/backend/services/authorizations";
import { rewardService } from "@/backend/services/rewards";
import { idParamSchema } from "@/backend/validators/index.validator";
import {
  rewardConvertBodySchema,
  type RewardConvertBodySchema,
} from "@/backend/validators/reward.validator";
import { accepted } from "@/utils/response";

export const POST = withMiddleware<RewardConvertBodySchema, PathParameters, null>(
  async (request) => {
    const receiptId = request.params!.id;
    const body = request.validatedData!;
    // Owner-scoped receipt and authorization; conversion never accepts a raw
    // beneficiary, recipient or calldata input.
    await rewardService.getOwned(request.user!.id, receiptId);
    await authorizationService.getOwned(request.user!.id, body.authorization_id);
    const operationId = await rewardService.convert(receiptId, body.authorization_id);
    const res = accepted({ operation_id: operationId }, "Receipt conversion accepted");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [
    authMiddleware,
    originMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(rewardConvertBodySchema),
  ],
);
