import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appInboxService } from "@/backend/services/app/inbox";
import {
  notificationsQuerySchema,
  type NotificationsQuerySchema,
} from "@/backend/validators/app/notifications.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, NotificationsQuerySchema>(
  async (request) => {
    return ok(
      await appInboxService.list(request.user!.id, request.query!.cursor),
      "Notifications",
    );
  },
  [authMiddleware, queryValidatorMiddleware(notificationsQuerySchema)],
  { audience: "customer" },
);
