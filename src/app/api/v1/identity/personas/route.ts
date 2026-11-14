import {
  authMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { kycService } from "@/backend/services/kyc";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async () => {
    return ok(kycService.personas(), "Beta test personas");
  },
  [authMiddleware],
);
