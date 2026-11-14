import { bodyValidatorMiddleware, withMiddleware } from "@/backend/middleware";
import { authService } from "@/backend/services/auth";
import { identityTokenValidatorSchema, type IdentityTokenValidatorSchema } from "@/backend/validators/auth.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<IdentityTokenValidatorSchema, null, null>(
  async (request) => {
    const { phone } = request.validatedData!;
    const { token, expiresAt } = authService.issueBetaIdentityToken(phone);
    return ok(
      {
        identity_token: token,
        expires_at: expiresAt.toISOString(),
        stage: "beta",
        test_details_only: true,
      },
      "Simulated identity token issued (no SMS is sent in beta)",
    );
  },
  [bodyValidatorMiddleware(identityTokenValidatorSchema)],
);
