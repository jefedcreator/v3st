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
    id: z.string().regex(/^(dep|wd|pay|ord|inv|eop|wk)_[A-Za-z0-9]+$/, "Invalid activity id"),
  })
  .strict();
export type ActivityIdParamSchema = z.infer<typeof activityIdParamSchema>;
