import { z } from "zod";

import { parseRaw } from "@/utils/asset-units";

export const O1_SCHEMA_VERSION = "o1-dex-aggregator/1";

const assetAmountSchema = z
  .object({
    asset: z.string().regex(/^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/),
    raw: z.string().regex(/^(0|[1-9]\d*)$/),
  })
  .strict()
  .transform((value) => ({ asset: value.asset, raw: parseRaw(value.raw) }));

export const o1QuoteResponseSchema = z
  .object({
    quoteId: z.string().min(8),
    schemaVersion: z.literal(O1_SCHEMA_VERSION),
    chainId: z.number().int().positive(),
    input: assetAmountSchema,
    output: assetAmountSchema,
    minOutput: assetAmountSchema,
    fee: z
      .object({
        asset: z.string(),
        raw: z.string().regex(/^(0|[1-9]\d*)$/),
        bps: z.number().int().min(0).max(10_000),
      })
      .strict()
      .transform((value) => ({ asset: value.asset, raw: parseRaw(value.raw), bps: value.bps })),
    priceImpactBps: z.number().int().min(0),
    expiresAt: z.string().datetime({ offset: true }),
    route: z.array(z.string().min(1)).min(1),
    routeFeeChargedOnce: z.literal(true).optional(),
  })
  .strict();

export type O1QuoteResponse = z.infer<typeof o1QuoteResponseSchema>;

export const o1PreparedResponseSchema = z
  .object({
    quoteId: z.string().min(8),
    schemaVersion: z.literal(O1_SCHEMA_VERSION),
    kind: z.literal("unsigned_transaction"),
    unsignedTx: z
      .object({
        chainId: z.number().int().positive(),
        to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        data: z.string().regex(/^0x[0-9a-fA-F]*$/),
        value: z.string().regex(/^(0|[1-9]\d*)$/),
        nonce: z.string().regex(/^(0|[1-9]\d*)$/),
        gas: z.string().regex(/^(0|[1-9]\d*)$/),
        maxFeePerGas: z.string().regex(/^(0|[1-9]\d*)$/),
        maxPriorityFeePerGas: z.string().regex(/^(0|[1-9]\d*)$/),
      })
      .strict(),
    note: z.string().optional(),
  })
  .strict();

export type O1PreparedResponse = z.infer<typeof o1PreparedResponseSchema>;

export class O1SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "O1SchemaError";
  }
}

export function parseO1Quote(payload: unknown): O1QuoteResponse {
  const result = o1QuoteResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new O1SchemaError(`o1 quote payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

export function parseO1Prepared(payload: unknown): O1PreparedResponse {
  const result = o1PreparedResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new O1SchemaError(`o1 prepared payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
