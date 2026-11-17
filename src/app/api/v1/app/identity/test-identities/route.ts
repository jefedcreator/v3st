import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { appIdentityService } from "@/backend/services/app/identity";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async () => ok(appIdentityService.testIdentities(), "Test identities"),
  [authMiddleware],
  { audience: "customer" },
);
