import { z } from "zod";

export const activityListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ActivityListQuerySchema = z.infer<typeof activityListQuerySchema>;

export const activityIdParamSchema = z
  .object({
    // Week items are keyed by the week's date (wk_YYYY-MM-DD); the rest by row id.
    id: z
      .string()
      .regex(/^(?:(?:dep|wd|pay|ord|inv|eop)_[A-Za-z0-9]+|wk_\d{4}-\d{2}-\d{2})$/, "Invalid activity id"),
  })
  .strict();
export type ActivityIdParamSchema = z.infer<typeof activityIdParamSchema>;
