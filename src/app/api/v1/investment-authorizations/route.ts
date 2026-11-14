import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { authorizationService } from "@/backend/services/authorizations";
import {
  authorizationCreateBodySchema,
  type AuthorizationCreateBodySchema,
} from "@/backend/validators/authorization.validator";
import { created, ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const res = ok(await authorizationService.list(request.user!.id), "Investment authorizations");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware],
);

export const POST = withMiddleware<AuthorizationCreateBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const { dto, created: isCreated } = await authorizationService.create(
      request.user!.id,
      {
        scope: body.scope,
        stockId: body.stock_id ?? null,
        strategyId: body.strategy_id ?? null,
        maxSpendUsdc: body.max_spend_usdc,
        durationDays: body.duration_days,
        policyVersion: body.policy_version,
      },
      request.idempotencyKey!,
    );
    const res = isCreated ? created(dto, "Authorization created") : ok(dto, "Authorization", 200);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(authorizationCreateBodySchema),
  ],
);
