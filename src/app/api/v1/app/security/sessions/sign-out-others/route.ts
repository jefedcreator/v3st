import { authMiddleware, originMiddleware, withMiddleware } from "@/backend/middleware";
import { securityService } from "@/backend/services/security";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, null, null>(
  async (request) => {
    const { revoked } = await securityService.revokeOtherSessions(
      request.user!.id,
      request.user!.session.id,
    );
    return ok({ signed_out: revoked }, "Other sessions signed out");
  },
  [authMiddleware, originMiddleware],
  { audience: "customer" },
);
