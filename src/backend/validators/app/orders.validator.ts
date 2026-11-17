import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "../index.validator";

const pinField = z.string().regex(/^\d{4}$/);

const amountKoboField = minorAmountSchema.refine(
  (value) => value >= 100_000n,
  "Below the minimum order",
);

export const orderPreviewBodySchema = z.union([
  z
    .object({
      stock_id: cuidSchema,
      side: z.literal("buy"),
      amount_kobo: amountKoboField,
      pay_with: z.enum(["cash", "bank_transfer"]).optional(),
    })
    .strict(),
  z
    .object({
      stock_id: cuidSchema,
      side: z.literal("sell"),
      amount_kobo: amountKoboField,
    })
    .strict(),
  z
    .object({
      stock_id: cuidSchema,
      side: z.literal("sell"),
      sell_all: z.literal(true),
    })
    .strict(),
]);
export type OrderPreviewBody = z.infer<typeof orderPreviewBodySchema>;

export const orderPlaceBodySchema = z
  .object({
    preview_id: cuidSchema,
    pin: pinField,
  })
  .strict();
export type OrderPlaceBodySchema = z.infer<typeof orderPlaceBodySchema>;
