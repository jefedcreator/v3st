import { bodyValidatorMiddleware, withMiddleware } from "@/backend/middleware";
import { authService } from "@/backend/services/auth";
import { sessionValidatorSchema, type SessionValidatorSchema } from "@/backend/validators/auth.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<SessionValidatorSchema, null, null>(
  async (request) => {
    const { identity_token } = request.validatedData!;
    const result = await authService.signIn(identity_token);
    const res = ok(
      {
        created: result.created,
        expires_at: result.expires.toISOString(),
        stage: "beta",
        test_funds_only: true,
      },
      "Session created",
    );
    authService.setSessionCookie(res, result.sessionToken, result.expires);
    return res;
  },
  [bodyValidatorMiddleware(sessionValidatorSchema)],
);
