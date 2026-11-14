import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { userService } from "@/backend/services/users";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const me = await userService.me(request.user!.id);
    return ok(me, "Current user");
  },
  [authMiddleware],
);
