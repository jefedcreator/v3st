import { z } from "zod";

import { parseRaw } from "@/utils/asset-units";

// V3ST replica definition (NOT a captured Stonks response): synthetic schema for the
// local versioned distribution replica.
export const STONKS_SCHEMA_VERSION = "v3st-stonks-distribution-replica/1";

export class StonksSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StonksSchemaError";
  }
}

export const stonksClaimSchema = z
  .object({
    schemaVersion: z.literal(STONKS_SCHEMA_VERSION),
    epochKey: z.string().regex(/^0x[0-9a-f]{64}$/),
    generation: z.number().int().min(1).max(255),
    rewardAsset: z.string().regex(/^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/),
    entitlement: z.string().regex(/^(0|[1-9]\d*)$/),
  })
  .strict()
  .transform((value) => ({ ...value, entitlement: parseRaw(value.entitlement) }));

export type StonksClaim = z.infer<typeof stonksClaimSchema>;

export function parseStonksClaim(payload: unknown): StonksClaim {
  const result = stonksClaimSchema.safeParse(payload);
  if (!result.success) {
    throw new StonksSchemaError(`stonks claim payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
