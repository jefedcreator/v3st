import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import {
  bankAccountBodySchema,
  type BankAccountBodySchema,
} from "@/backend/validators/app/cash.validator";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    return ok(await appCashService.bankAccount(request.user!.id), "Bank account");
  },
  [authMiddleware],
  { audience: "customer" },
);

export const PUT = withMiddleware<BankAccountBodySchema, null, null>(
  async (request) => {
    const { bank_code, account_number, pin } = request.validatedData!;
    const dto = await appCashService.setBankAccount(request.user!.id, {
      bankCode: bank_code,
      accountNumber: account_number,
      pin,
    });
    return ok(dto, "Bank account saved");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(bankAccountBodySchema)],
  { audience: "customer" },
);
