import { z } from "zod";

import { cuidSchema } from "../index.validator";

export const notificationsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(500).optional(),
  })
  .strict();
export type NotificationsQuerySchema = z.infer<typeof notificationsQuerySchema>;

export const notificationReadBodySchema = z.union([
  z
    .object({
      ids: z.array(cuidSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      all: z.literal(true),
    })
    .strict(),
]);
export type NotificationReadBodySchema = z.infer<typeof notificationReadBodySchema>;
