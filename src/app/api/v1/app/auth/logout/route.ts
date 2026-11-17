import { authMiddleware, originMiddleware, withMiddleware } from "@/backend/middleware";
import { authService } from "@/backend/services/auth";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, null, null>(
  async (request) => {
    await authService.logout(request.user!.session.sessionToken);
    const res = ok({ signed_out: true }, "Signed out");
    authService.clearSessionCookie(res);
    return res;
  },
  [authMiddleware, originMiddleware],
  { audience: "customer" },
);
