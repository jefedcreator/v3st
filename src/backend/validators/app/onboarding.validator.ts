import { z } from "zod";

export const documentSlugSchema = z.enum([
  "terms",
  "risks",
  "how-shares-are-held",
  "earn-risks",
  "privacy",
]);
export type DocumentSlugSchema = z.infer<typeof documentSlugSchema>;

export const testIdentitySchema = z
  .object({
    test_identity_id: z.enum(["ada_tier2", "tunde_tier1", "rejected"]),
  })
  .strict();
export type TestIdentitySchema = z.infer<typeof testIdentitySchema>;

export const agreementsSchema = z
  .object({
    documents: z
      .array(
        z
          .object({
            slug: documentSlugSchema,
            version: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export type AgreementsSchema = z.infer<typeof agreementsSchema>;

export const documentSlugParamSchema = z
  .object({
    slug: documentSlugSchema,
  })
  .strict();
export type DocumentSlugParamSchema = z.infer<typeof documentSlugParamSchema>;
