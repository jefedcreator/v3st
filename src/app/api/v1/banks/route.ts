import {
  authMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async () => {
    return ok(await bankAccountService.listBanks(), "Supported banks");
  },
  [authMiddleware],
);
