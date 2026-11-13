import {
  authMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async () => {
    return ok(await bankAccountService.listBanks(), "Supported banks");
  },
  [authMiddleware],
);
