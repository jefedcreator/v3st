import { z } from "zod";

export const personaValidatorSchema = z
  .object({
    persona: z.enum(["ada_tier2", "tunde_tier1", "rejected"]),
  })
  .strict();

export type PersonaValidatorSchema = z.infer<typeof personaValidatorSchema>;
