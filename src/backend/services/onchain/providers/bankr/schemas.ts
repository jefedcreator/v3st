import type { Hex } from "viem";
import { z } from "zod";

import { assertRaw, decimalTextToBigInt } from "@/utils/asset-units";

// V3ST synthetic Bankr Wallet API schema (replica definition, not a captured
// Bankr response). Bankr amounts arrive as decimal strings plus a decimals
// field; conversion to raw units must be exact (never floating point).
export const BANKR_SCHEMA_VERSION = "bankr-wallet-api/1";

export class BankrSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankrSchemaError";
  }
}

const assetKeyRegex = /^[a-z0-9_-]+:\d+:0x[0-9a-f]{40}$/;
const decimalStringRegex = /^\d+(?:\.\d+)?$/;

export function decimalStringToRaw(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new BankrSchemaError(`Unsupported decimals: ${decimals}`);
  }
  // decimalTextToBigInt handles the exponent exactly in bigint arithmetic; a
  // fractional remainder beyond the asset's decimals is rejected there.
  return assertRaw(decimalTextToBigInt(`${amount}e${decimals}`));
}

export function rawToDecimalString(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const base = 10n ** BigInt(decimals);
  const intPart = raw / base;
  const fracPart = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart.toString();
}

const decimalAmountSchema = z
  .object({
    asset: z.string().regex(assetKeyRegex),
    amount: z.string().regex(decimalStringRegex),
    decimals: z.number().int().min(0).max(77),
  })
  .strict()
  .transform((value) => ({ asset: value.asset, raw: decimalStringToRaw(value.amount, value.decimals) }));

export const bankrQuoteSchema = z
  .object({
    quoteId: z.string().min(8),
    schemaVersion: z.literal(BANKR_SCHEMA_VERSION),
    chainId: z.number().int().positive(),
    input: decimalAmountSchema,
    output: decimalAmountSchema,
    minOutput: decimalAmountSchema,
    fee: z
      .object({
        asset: z.string().regex(assetKeyRegex),
        amount: z.string().regex(decimalStringRegex),
        decimals: z.number().int().min(0).max(77),
        bps: z.number().int().min(0).max(10_000),
      })
      .strict()
      .transform((value) => ({
        asset: value.asset,
        raw: decimalStringToRaw(value.amount, value.decimals),
        bps: value.bps,
      })),
    priceImpactBps: z.number().int().min(0),
    expiresAt: z.string().datetime({ offset: true }),
    // A quote never grants location/eligibility clearance; that approval is separate.
    locationClearance: z.literal("required_separately"),
  })
  .strict();

export type BankrQuoteResponse = z.infer<typeof bankrQuoteSchema>;

// The Wallet API answers with HTTP 200 even for failed swaps; success:false is a
// revert, never a fill.
export const bankrSwapEnvelopeSchema = z
  .object({
    httpStatus: z.literal(200),
    body: z
      .object({
        schemaVersion: z.literal(BANKR_SCHEMA_VERSION),
        success: z.boolean(),
        operationId: z.string().uuid(),
        status: z.enum(["submitted", "reverted", "unresolved"]),
        txHash: z
          .string()
          .regex(/^0x[0-9a-f]{64}$/)
          .nullable()
          .optional(),
        quote: bankrQuoteSchema.optional(),
        error: z.string().optional(),
      })
      .strict(),
    // Fixture metadata marking the payload as a V3ST replica definition.
    replicaNote: z.string().optional(),
  })
  .strict();

export type BankrSwapEnvelope = z.infer<typeof bankrSwapEnvelopeSchema>;

export type NormalizedBankrSwap = {
  operationId: string;
  txHash: Hex | null;
  settled: boolean;
  reverted: boolean;
  unresolved: boolean;
};

export function parseBankrQuote(payload: unknown): BankrQuoteResponse {
  const result = bankrQuoteSchema.safeParse(payload);
  if (!result.success) {
    throw new BankrSchemaError(`bankr quote payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

export function parseBankrSwapEnvelope(payload: unknown): BankrSwapEnvelope {
  const result = bankrSwapEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new BankrSchemaError(`bankr swap payload rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

// Normalizes the gateway envelope: HTTP 200 + success:false is a revert (never a
// fill); an unresolved status keeps the operation unreconciled until onchain
// evidence is looked up before any resend.
export function normalizeBankrSwap(payload: unknown): NormalizedBankrSwap {
  const envelope = parseBankrSwapEnvelope(payload);
  const body = envelope.body;
  const txHash = (body.txHash ?? null) as Hex | null;
  if (!body.success) {
    return {
      operationId: body.operationId,
      txHash,
      settled: false,
      reverted: body.status !== "unresolved",
      unresolved: body.status === "unresolved",
    };
  }
  if (body.status === "unresolved") {
    return { operationId: body.operationId, txHash, settled: false, reverted: false, unresolved: true };
  }
  return { operationId: body.operationId, txHash, settled: body.status === "submitted", reverted: false, unresolved: false };
}
