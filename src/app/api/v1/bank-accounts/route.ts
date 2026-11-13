import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { bankAccountService } from "@/backend/services/bank-accounts";
import {
  bankAccountValidatorSchema,
  type BankAccountValidatorSchema,
} from "@/backend/validators/bank-account.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async (request) => {
    return ok(await bankAccountService.list(request.user!.id), "Bank accounts");
  },
  [authMiddleware],
);

export const POST = withMiddleware<BankAccountValidatorSchema>(
  async (request) => {
    const { bank_code, account_number } =
      request.validatedData as BankAccountValidatorSchema;
    const account = await bankAccountService.add(request.user!.id, {
      bank_code,
      account_number,
    });
    return ok(account, "Bank account verified and stored");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(bankAccountValidatorSchema)],
);
