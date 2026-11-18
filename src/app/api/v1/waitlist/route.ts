import {
  bodyValidatorMiddleware,
  rateLimitMiddleware,
  sameOriginMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { waitlistService } from "@/backend/services/waitlist";
import {
  waitlistBodySchema,
  type WaitlistBodySchema,
} from "@/backend/validators/waitlist.validator";
import { ok } from "@/utils/response";

// The landing page's waitlist. JSON answers the normal envelope; a native form
// post (application/x-www-form-urlencoded) is redirected to /waitlist?status=…
// so it works without JavaScript.
export const POST = withMiddleware<WaitlistBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const result = await waitlistService.join({
      email: body.email,
      source: body.source,
      website: body.website,
    });
    return ok(result, "You're on the list.");
  },
  [
    sameOriginMiddleware,
    rateLimitMiddleware({ scope: "waitlist", limit: 5, windowSeconds: 600 }),
    bodyValidatorMiddleware(waitlistBodySchema),
  ],
  {
    audience: "customer",
    bodyMode: "form",
    formRedirect: { path: "/waitlist", successStatus: "joined" },
  },
);
