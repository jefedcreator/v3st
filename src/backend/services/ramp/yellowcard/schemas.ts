import { z } from "zod";

export const ratesResponseSchema = z
  .object({
    buy: z.string(),
    sell: z.string(),
  })
  .passthrough();

export const channelsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string(),
          type: z.string(),
          country: z.string(),
          active: z.boolean().optional(),
          min: z.string().optional(),
          max: z.string().optional(),
          fee: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const bankInfoSchema = z
  .object({
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    accountName: z.string().optional(),
    reference: z.string().nullable().optional(),
  })
  .passthrough();

export const receiveResponseSchema = z
  .object({
    id: z.string(),
    sequenceId: z.string().optional(),
    status: z.string(),
    localAmount: z.union([z.string(), z.number()]).optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    fee: z.union([z.string(), z.number()]).optional(),
    feeLocal: z.union([z.string(), z.number()]).optional(),
    rate: z.union([z.string(), z.number()]).optional(),
    expiresAt: z.union([z.string(), z.number()]).optional(),
    bankInfo: bankInfoSchema.optional(),
  })
  .passthrough();

export const sendResponseSchema = receiveResponseSchema;

export const networksResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string(),
          name: z.string().optional(),
          code: z.string().optional(),
          country: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const detailsBankResponseSchema = z
  .object({
    accountName: z.string(),
  })
  .passthrough();

export const accountResponseSchema = z
  .object({
    accounts: z.array(
      z
        .object({
          currency: z.string(),
          currencyType: z.string().optional(),
          available: z.union([z.string(), z.number()]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const webhookPayloadSchema = z
  .object({
    id: z.string(),
    sequenceId: z.string().optional(),
    status: z.string(),
    apiKey: z.string().optional(),
    event: z.string(),
    errorCode: z.string().optional(),
    executedAt: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
