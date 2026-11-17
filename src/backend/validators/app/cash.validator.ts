import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "../index.validator";

const pinField = z.string().regex(/^\d{4}$/);

const accountNumberField = z
  .string()
  .regex(/^\d{10}$/, "Enter your 10-digit account number");

export const cashDepositBodySchema = z
  .object({
    amount_kobo: minorAmountSchema,
  })
  .strict();
export type CashDepositBodySchema = z.infer<typeof cashDepositBodySchema>;

export const bankAccountBodySchema = z
  .object({
    bank_code: z.string().min(1),
    account_number: accountNumberField,
    pin: pinField,
  })
  .strict();
export type BankAccountBodySchema = z.infer<typeof bankAccountBodySchema>;

export const withdrawalPreviewBodySchema = z
  .object({
    amount_kobo: minorAmountSchema,
  })
  .strict();
export type WithdrawalPreviewBodySchema = z.infer<typeof withdrawalPreviewBodySchema>;

export const withdrawalBodySchema = z
  .object({
    preview_id: cuidSchema,
    pin: pinField,
  })
  .strict();
export type WithdrawalBodySchema = z.infer<typeof withdrawalBodySchema>;
