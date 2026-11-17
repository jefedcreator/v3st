import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appActivityService } from "@/backend/services/app/activity";
import {
  activityListQuerySchema,
  type ActivityListQuerySchema,
} from "@/backend/validators/app/activity.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, ActivityListQuerySchema>(
  async (request) => {
    return ok(
      await appActivityService.list(request.user!.id, {
        cursor: request.query!.cursor,
        limit: request.query!.limit,
      }),
      "Activity",
    );
  },
  [authMiddleware, queryValidatorMiddleware(activityListQuerySchema)],
  { audience: "customer" },
);
