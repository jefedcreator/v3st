import { z } from "zod";

import { parseRaw } from "@/utils/asset-units";

// V3ST synthetic replica definition (all names here are V3ST replica definitions, not
// verified BaseStonk ABI/API names).
export const BASESTONK_SCHEMA_VERSION = "v3st-hook-fee-replica/1";

export class BaseStonkSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseStonkSchemaError";
  }
}

export const basestonkFeeSchema = z
  .object({
    schemaVersion: z.literal(BASESTONK_SCHEMA_VERSION),
    launchId: z.string().regex(/^0x[0-9a-f]{64}$/),
    hookVersion: z.string().regex(/^0x[0-9a-f]{64}$/),
    feeBps: z.number().int().min(0).max(10_000),
    feeAsset: z.string().regex(/^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/),
    pendingFees: z.string().regex(/^(0|[1-9]\d*)$/),
  })
  .strict()
  .transform((value) => ({ ...value, pendingFees: parseRaw(value.pendingFees) }));

export type BaseStonkFee = z.infer<typeof basestonkFeeSchema>;

export function parseBaseStonkFee(payload: unknown): BaseStonkFee {
  const result = basestonkFeeSchema.safeParse(payload);
  if (!result.success) {
    throw new BaseStonkSchemaError(`basestonk fee payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
