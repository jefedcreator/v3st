import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { securityService } from "@/backend/services/security";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const sessions = await securityService.listSessions(
      request.user!.id,
      request.user!.session.id,
    );
    return ok(sessions, "Sessions");
  },
  [authMiddleware],
  { audience: "customer" },
);
