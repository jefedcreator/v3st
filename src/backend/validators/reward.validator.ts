import { z } from "zod";

import { cuidSchema } from "./index.validator";

export const rewardConvertBodySchema = z
  .object({
    authorization_id: cuidSchema,
  })
  .strict();

export type RewardConvertBodySchema = z.infer<typeof rewardConvertBodySchema>;
