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
    // Task 4's strict one-time/standing union, passed through as-is.
    const { dto, created: isCreated } = await authorizationService.create(
      request.user!.id,
      body,
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
