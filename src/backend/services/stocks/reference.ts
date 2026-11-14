import { z } from "zod";

import type { Stock } from "@/server/prisma";
import { policy } from "@/backend/config/policy";
import { assetKey } from "@/backend/services/onchain/types";
import { WAD } from "@/backend/services/stocks/corporate-actions";

export type ReferencePriceBasis = "token_nav" | "share_price";

export type ReferenceStock = {
  assetKey: string;
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: string;
  issuer: string;
  rightsSummary: string;
  multiplierWad: bigint;
  referencePriceMicroUsd: bigint | null;
  referenceBasis: ReferencePriceBasis | null;
  referenceAsOf: Date | null;
};

const referencePriceSchema = z
  .object({
    micro_usd: z.string().regex(/^(0|[1-9]\d*)$/).optional(),
    basis: z.enum(["token_nav", "share_price"]).optional(),
    as_of: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const referenceInstrumentSchema = z
  .object({
    kind: z.string().default("stock"),
    issuer: z.string().optional(),
    rights: z.string().optional(),
  })
  .strict();

const referenceEntrySchema = z
  .object({
    chain_id: z.number().int().positive(),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    symbol: z.string().min(1),
    name: z.string().min(1),
    decimals: z.number().int().min(0).max(36),
    multiplier: z.string().regex(/^(0|[1-9]\d*)$/).optional(),
    instrument: referenceInstrumentSchema.optional(),
    price: referencePriceSchema.optional(),
  })
  .strict();

const referencePageSchema = z
  .object({
    data: z.array(referenceEntrySchema),
    page: z.object({ next: z.string().optional() }).strict().optional(),
  })
  .strict();

export class ReferenceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceParseError";
  }
}

function parseEntry(entry: z.infer<typeof referenceEntrySchema>): ReferenceStock {
  const price = entry.price;
  return {
    assetKey: assetKey("base", entry.chain_id, entry.address.toLowerCase()),
    chainId: entry.chain_id,
    address: entry.address.toLowerCase(),
    symbol: entry.symbol,
    name: entry.name,
    decimals: entry.decimals,
    kind: entry.instrument?.kind ?? "stock",
    issuer: entry.instrument?.issuer ?? "",
    rightsSummary: entry.instrument?.rights ?? "",
    multiplierWad: entry.multiplier ? BigInt(entry.multiplier) : WAD,
    referencePriceMicroUsd: price?.micro_usd ? BigInt(price.micro_usd) : null,
    referenceBasis: price?.basis ?? null,
    referenceAsOf: price?.as_of ? new Date(price.as_of) : null,
  };
}

export const stockReference = {
  parse(input: unknown): ReferenceStock[] {
    const result = referencePageSchema.safeParse(input);
    if (!result.success) {
      throw new ReferenceParseError(`Reference payload does not match the documented schema: ${result.error.issues[0]?.message}`);
    }
    return result.data.data.map(parseEntry);
  },

  parsePage(input: unknown): { stocks: ReferenceStock[]; next: string | null } {
    const result = referencePageSchema.safeParse(input);
    if (!result.success) {
      throw new ReferenceParseError("Reference payload does not match the documented schema");
    }
    return {
      stocks: result.data.data.map(parseEntry),
      next: result.data.page?.next ?? null,
    };
  },
};

// Unknown metadata is never proof of tradability: an approved issuer, a rights
// summary, stock kind and chain+address identity are all required, and a usable
// execution route is checked separately by the router.
export function evaluateReference(stock: ReferenceStock): { tradable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (stock.kind !== "stock") reasons.push("kind_not_stock");
  if (!stock.issuer) reasons.push("issuer_unknown");
  if (!stock.rightsSummary) reasons.push("rights_unknown");
  if (stock.chainId !== 8453) reasons.push("unsupported_chain");
  return { tradable: reasons.length === 0, reasons };
}

// A reference NAV older than the policy window, or missing, cannot authorize trades.
export function referenceUsable(stock: Stock, at: Date): boolean {
  if (stock.referencePriceMicroUsd === null || !stock.referenceBasis || !stock.referenceAsOf) {
    return false;
  }
  const ageMs = at.getTime() - stock.referenceAsOf.getTime();
  return ageMs >= 0 && ageMs <= policy.onchain.referenceMaxAgeSeconds * 1000;
}
