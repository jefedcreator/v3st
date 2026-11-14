import { z } from "zod";

import { parseMinor } from "@/utils/money";

export const cuidSchema = z.string().cuid();

export const minorAmountSchema = z
  .string()
  .superRefine((val, ctx) => {
    try {
      parseMinor(val);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid minor amount",
      });
    }
  })
  .transform((val) => parseMinor(val));

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type PaginationQuerySchema = z.infer<typeof paginationQuerySchema>;

export const idParamSchema = z.object({ id: cuidSchema }).strict();

export type IdParamSchema = z.infer<typeof idParamSchema>;
