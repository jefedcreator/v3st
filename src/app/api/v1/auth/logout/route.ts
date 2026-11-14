import {
  authMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { authService } from "@/backend/services/auth";
import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { ok } from "@/utils/response";

export const POST = withMiddleware<null, null, null>(
  async (request) => {
    const token =
      request.cookies.get(SESSION_COOKIE_NAME)?.value ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
      "";
    await authService.logout(token);
    const res = ok({ revoked: true }, "Logged out");
    authService.clearSessionCookie(res);
    return res;
  },
  [authMiddleware, originMiddleware],
);
