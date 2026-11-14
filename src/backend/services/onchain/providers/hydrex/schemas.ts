import { z } from "zod";

import { parseRaw } from "@/utils/asset-units";

// V3ST synthetic Hydrex-style pool quote schema (replica definition, not a captured
// Hydrex response). Raw units arrive as decimal strings and are parsed exactly.
export const HYDREX_SCHEMA_VERSION = "hydrex-pool-replica/1";

export class HydrexSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HydrexSchemaError";
  }
}

const assetAmountSchema = z
  .object({
    asset: z.string().regex(/^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/),
    raw: z.string().regex(/^(0|[1-9]\d*)$/),
  })
  .strict()
  .transform((value) => ({ asset: value.asset, raw: parseRaw(value.raw) }));

export const hydrexQuoteResponseSchema = z
  .object({
    quoteId: z.string().min(8),
    schemaVersion: z.literal(HYDREX_SCHEMA_VERSION),
    chainId: z.number().int().positive(),
    pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    input: assetAmountSchema,
    output: assetAmountSchema,
    minOutput: assetAmountSchema,
    fee: z
      .object({
        asset: z.string().regex(/^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/),
        raw: z.string().regex(/^(0|[1-9]\d*)$/),
        bps: z.number().int().min(0).max(10_000),
      })
      .strict()
      .transform((value) => ({ asset: value.asset, raw: parseRaw(value.raw), bps: value.bps })),
    priceImpactBps: z.number().int().min(0),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type HydrexQuoteResponse = z.infer<typeof hydrexQuoteResponseSchema>;

export function parseHydrexQuote(payload: unknown): HydrexQuoteResponse {
  const result = hydrexQuoteResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new HydrexSchemaError(`hydrex quote payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
