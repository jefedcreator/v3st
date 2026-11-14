import { z } from "zod";

export const controlSchema = z
  .object({
    scope: z.enum([
      "deposits",
      "payouts",
      "trading",
      "provider:yellowcard",
      "provider:paycrest",
    ]),
    paused: z.boolean(),
    reason: z.string().min(1),
  })
  .strict();

export type ControlSchema = z.infer<typeof controlSchema>;
