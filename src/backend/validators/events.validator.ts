import { z } from "zod";

export const eventsQuerySchema = z
  .object({
    after: z.string().optional(),
  })
  .strict();

export type EventsQuerySchema = z.infer<typeof eventsQuerySchema>;
