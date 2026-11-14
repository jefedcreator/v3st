import { z } from "zod";

import { ONCHAIN_SCENARIO_KINDS } from "@/types/onchain";

import { cuidSchema } from "./index.validator";

export const onchainScenarioBodySchema = z
  .object({
    operation_id: cuidSchema,
    scenario: z.enum(ONCHAIN_SCENARIO_KINDS),
  })
  .strict();

export type OnchainScenarioBodySchema = z.infer<typeof onchainScenarioBodySchema>;
