import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { kycService } from "@/backend/services/kyc";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async () => {
    return ok(kycService.personas(), "Beta test personas");
  },
  [authMiddleware],
);
