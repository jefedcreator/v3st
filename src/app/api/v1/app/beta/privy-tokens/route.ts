import { bodyValidatorMiddleware, sameOriginMiddleware, withMiddleware } from "@/backend/middleware";
import { simulatedPrivy } from "@/backend/services/privy/simulated";
import {
  betaPrivyTokensSchema,
  type BetaPrivyTokensSchema,
} from "@/backend/validators/app/auth.validator";
import { ok } from "@/utils/response";

// Beta affordance: mints Privy-shaped tokens from the local simulated issuer
// so the real sign-in path runs without a Privy account. The response carries
// tokens for the app to send back, never text for the customer.
export const POST = withMiddleware<BetaPrivyTokensSchema, null, null>(
  async (request) => {
    const { email } = request.validatedData!;
    const tokens = simulatedPrivy.mint(email);
    return ok(
      { access_token: tokens.access_token, identity_token: tokens.identity_token },
      "Test sign-in tokens issued",
    );
  },
  [sameOriginMiddleware, bodyValidatorMiddleware(betaPrivyTokensSchema)],
  { audience: "customer" },
);
