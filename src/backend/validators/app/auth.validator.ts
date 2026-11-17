import { z } from "zod";

export const privySignInSchema = z
  .object({
    access_token: z.string().min(1),
    identity_token: z.string().min(1),
  })
  .strict();
export type PrivySignInSchema = z.infer<typeof privySignInSchema>;

export const betaPrivyTokensSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();
export type BetaPrivyTokensSchema = z.infer<typeof betaPrivyTokensSchema>;
