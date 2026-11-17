import { z } from "zod";

import { PREFERRED_NAME_PATTERN } from "@/backend/services/app/profile";

const pinField = z.string().regex(/^\d{4}$/);

export const profilePatchBodySchema = z
  .object({
    preferred_name: z
      .string()
      .regex(PREFERRED_NAME_PATTERN, "Use letters, spaces, apostrophes or hyphens")
      .nullable(),
  })
  .strict();
export type ProfilePatchBodySchema = z.infer<typeof profilePatchBodySchema>;

export const automationRenewBodySchema = z
  .object({
    pin: pinField,
  })
  .strict();
export type AutomationRenewBodySchema = z.infer<typeof automationRenewBodySchema>;
