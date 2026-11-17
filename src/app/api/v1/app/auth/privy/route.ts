import {
  bodyValidatorMiddleware,
  sameOriginMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { authService } from "@/backend/services/auth";
import { deviceLabel } from "@/backend/services/app/devices";
import { privyAuth } from "@/backend/services/privy";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import {
  privySignInSchema,
  type PrivySignInSchema,
} from "@/backend/validators/app/auth.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<PrivySignInSchema, null, null>(
  async (request) => {
    const { access_token, identity_token } = request.validatedData!;
    const login = await privyAuth.verifyLogin({
      accessToken: access_token,
      identityToken: identity_token,
    });
    const result = await authService.signInWithPrivy(
      login,
      deviceLabel(request.headers.get("user-agent")),
    );
    const onboarding = await appOnboardingService.status(result.user.id);
    const res = ok(
      { is_new_customer: result.created, next_step: onboarding.next_step },
      "Signed in",
    );
    authService.setSessionCookie(res, result.sessionToken, result.expires);
    return res;
  },
  [sameOriginMiddleware, bodyValidatorMiddleware(privySignInSchema)],
  { audience: "customer" },
);
