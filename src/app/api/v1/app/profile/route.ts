import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appProfileService } from "@/backend/services/app/profile";
import {
  profilePatchBodySchema,
  type ProfilePatchBodySchema,
} from "@/backend/validators/app/settings.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appProfileService.get(request.user!.id), "Profile");
  },
  [authMiddleware],
  { audience: "customer" },
);

export const PATCH = withMiddleware<ProfilePatchBodySchema, null, null>(
  async (request) => {
    return ok(
      await appProfileService.update(request.user!.id, {
        preferredName: request.validatedData!.preferred_name,
      }),
      "Profile saved",
    );
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(profilePatchBodySchema)],
  { audience: "customer" },
);
