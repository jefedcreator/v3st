import { z } from "zod";

export const identityTokenValidatorSchema = z
  .object({
    phone: z.string().min(1),
  })
  .strict();

export type IdentityTokenValidatorSchema = z.infer<typeof identityTokenValidatorSchema>;

export const sessionValidatorSchema = z
  .object({
    identity_token: z.string().min(1),
  })
  .strict();

export type SessionValidatorSchema = z.infer<typeof sessionValidatorSchema>;
