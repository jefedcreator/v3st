import {
  authMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appActivityService } from "@/backend/services/app/activity";
import {
  activityIdParamSchema,
  type ActivityIdParamSchema,
} from "@/backend/validators/app/activity.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, ActivityIdParamSchema, null>(
  async (request) => {
    return ok(await appActivityService.get(request.user!.id, request.params!.id), "Activity item");
  },
  [authMiddleware, pathParamValidatorMiddleware(activityIdParamSchema)],
  { audience: "customer" },
);
