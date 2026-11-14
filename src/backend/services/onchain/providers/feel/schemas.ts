import { z } from "zod";

import { parseRaw } from "@/utils/asset-units";

// V3ST replica definition (NOT a captured Feel.cash response): synthetic schema for the
// local launch-holder distribution replica.
export const FEEL_SCHEMA_VERSION = "v3st-feel-distribution-replica/1";

export class FeelSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeelSchemaError";
  }
}

export const feelClaimSchema = z
  .object({
    schemaVersion: z.literal(FEEL_SCHEMA_VERSION),
    epochKey: z.string().regex(/^0x[0-9a-f]{64}$/),
    launchToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    rewardAsset: z.string().regex(/^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/),
    entitlement: z.string().regex(/^(0|[1-9]\d*)$/),
  })
  .strict()
  .transform((value) => ({ ...value, entitlement: parseRaw(value.entitlement) }));

export type FeelClaim = z.infer<typeof feelClaimSchema>;

export function parseFeelClaim(payload: unknown): FeelClaim {
  const result = feelClaimSchema.safeParse(payload);
  if (!result.success) {
    throw new FeelSchemaError(`feel claim payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
