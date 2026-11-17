import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appInboxService } from "@/backend/services/app/inbox";
import {
  notificationReadBodySchema,
  type NotificationReadBodySchema,
} from "@/backend/validators/app/notifications.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<NotificationReadBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    return ok(
      await appInboxService.markRead(request.user!.id, {
        ids: "ids" in body ? body.ids : undefined,
        all: "all" in body ? body.all : undefined,
      }),
      "Notifications marked read",
    );
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(notificationReadBodySchema)],
  { audience: "customer" },
);
