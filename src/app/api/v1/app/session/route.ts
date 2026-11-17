import { optionalAuthMiddleware, withMiddleware } from "@/backend/middleware";
import { appSessionService } from "@/backend/services/app/session";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => ok(await appSessionService.get(request.user), "Session"),
  [optionalAuthMiddleware],
  { audience: "customer" },
);
