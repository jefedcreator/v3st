import { z } from "zod";

// Public waitlist sign-up body. Strict: unknown keys are rejected. `website` is
// the honeypot field — real visitors never fill it.
export const waitlistBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email(),
    source: z.enum(["hero", "join", "waitlist_page"]).default("hero"),
    website: z.string().max(200).optional(),
  })
  .strict();

export type WaitlistBodySchema = z.infer<typeof waitlistBodySchema>;
