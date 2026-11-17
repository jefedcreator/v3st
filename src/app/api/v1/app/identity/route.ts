import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appIdentityService } from "@/backend/services/app/identity";
import {
  testIdentitySchema,
  type TestIdentitySchema,
} from "@/backend/validators/app/onboarding.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<TestIdentitySchema, null, null>(
  async (request) => {
    const { test_identity_id } = request.validatedData!;
    const result = await appIdentityService.verify(request.user!.id, test_identity_id);
    return ok(result, result.verified ? "Identity verified" : "Verification failed");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(testIdentitySchema)],
  { audience: "customer" },
);
