import {
  authMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { userService } from "@/backend/services/users";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async (request) => {
    const me = await userService.me(request.user!.id);
    return ok(me, "Current user");
  },
  [authMiddleware],
);
