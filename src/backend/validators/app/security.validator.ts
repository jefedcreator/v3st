import { z } from "zod";

const pinField = z.string().regex(/^\d{4}$/);

export const setPinSchema = z
  .object({
    pin: pinField,
    current_pin: pinField.optional(),
  })
  .strict();
export type SetPinSchema = z.infer<typeof setPinSchema>;

export const resetPinSchema = z
  .object({
    access_token: z.string().min(1),
    identity_token: z.string().min(1),
    pin: pinField,
  })
  .strict();
export type ResetPinSchema = z.infer<typeof resetPinSchema>;
