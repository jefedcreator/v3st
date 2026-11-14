import { z } from "zod";

export const bankAccountValidatorSchema = z
  .object({
    bank_code: z.string().min(1),
    account_number: z
      .string()
      .regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
  })
  .strict();

export type BankAccountValidatorSchema = z.infer<typeof bankAccountValidatorSchema>;
