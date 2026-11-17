import { z } from "zod";

import type { Stock } from "@/server/prisma";
import { policy } from "@/backend/config/policy";
import { assetKey } from "@/backend/services/onchain/types";
import { WAD } from "@/backend/services/stocks/corporate-actions";
import { fromDbRaw } from "@/utils/asset-units";
import { UnprocessableEntityException } from "@/utils/exceptions";

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

// Live Base Tokenized Stocks API shape. The API omits fields that hold their default
// value, so nav_price/nav_price_updated_at are optional per record; a record without
// them is skipped, never parsed as a zero or guessed price.
const liveTokenSchema = z.object({
  contract_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(36),
  multiplier: z.union([z.string(), z.number()]).optional(),
  nav_price: z.union([z.string(), z.number()]).optional(),
  nav_price_updated_at: z.string().optional(),
});

const livePageSchema = z.object({
  tokens: z.array(liveTokenSchema),
  next_page_token: z.string().optional(),
});

// Exact decimal conversion with string arithmetic (never Number): integer part plus
// the fraction truncated/padded to the target number of decimals.
export function decimalToRaw(value: string | number, targetDecimals: number): bigint {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new ReferenceParseError(`Not a non-negative decimal: ${text}`);
  }
  const [intPart, fracPart = ""] = text.split(".");
  const frac = fracPart.slice(0, targetDecimals).padEnd(targetDecimals, "0");
  return BigInt(intPart + frac);
}

function parseLiveEntry(entry: z.infer<typeof liveTokenSchema>): ReferenceStock {
  if (entry.nav_price === undefined || entry.nav_price_updated_at === undefined) {
    throw new ReferenceParseError(`Token ${entry.symbol} has no nav_price`);
  }
  const address = entry.contract_address.toLowerCase();
  return {
    assetKey: assetKey("base", 8453, address),
    chainId: 8453,
    address,
    symbol: entry.symbol,
    name: entry.name,
    decimals: entry.decimals,
    kind: "stock",
    issuer: "Coinbase Onchain SPV Ltd",
    rightsSummary: "Tokenized stock certificate; economic exposure only, no voting or direct redemption rights",
    multiplierWad: decimalToRaw(entry.multiplier ?? 1, 18),
    referencePriceMicroUsd: decimalToRaw(entry.nav_price, 6),
    referenceBasis: "token_nav",
    referenceAsOf: new Date(entry.nav_price_updated_at),
  };
}

export const stockReference = {
  parseLive(input: unknown): { stocks: ReferenceStock[]; next: string | null } {
    const result = livePageSchema.safeParse(input);
    if (!result.success) {
      throw new ReferenceParseError(`Live stocks payload does not match the documented schema: ${result.error.issues[0]?.message}`);
    }
    // Records without a published NAV are skipped; a zero or guessed price is never
    // written.
    const stocks: ReferenceStock[] = [];
    for (const entry of result.data.tokens) {
      if (entry.nav_price === undefined || entry.nav_price_updated_at === undefined) continue;
      stocks.push(parseLiveEntry(entry));
    }
    return { stocks, next: result.data.next_page_token ?? null };
  },

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

// The real mainnet asset a Base Sepolia stand-in token represents, e.g.
// "base:8453:0xb2…fb", recorded in stock provenance; null when not a stand-in.
export function standInFor(stock: Stock): string | null {
  const provenance = stock.provenance as { standInFor?: unknown } | null;
  return typeof provenance?.standInFor === "string" ? provenance.standInFor : null;
}

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

// The per-network trading window; unlisted chains keep the global default.
function tradeWindowSeconds(stock: Stock): number {
  return policy.onchain.reference.tradeMaxAgeSeconds[stock.chain] ?? policy.onchain.referenceMaxAgeSeconds;
}

// A reference NAV older than the trading window, or missing, cannot authorize trades.
export function referenceUsable(stock: Stock, at: Date): boolean {
  if (stock.referencePriceMicroUsd === null || !stock.referenceBasis || !stock.referenceAsOf) {
    return false;
  }
  const ageMs = at.getTime() - stock.referenceAsOf.getTime();
  return ageMs >= 0 && ageMs <= tradeWindowSeconds(stock) * 1000;
}

export type DisplayReference = {
  priceMicroUsd: bigint;
  basis: ReferencePriceBasis;
  asOf: Date;
  status: "live" | "delayed";
};

// The last known price for display: "live" inside the trading window, "delayed"
// up to the display window, null beyond it or when never priced.
export function referenceDisplay(stock: Stock, at: Date): DisplayReference | null {
  if (stock.referencePriceMicroUsd === null || !stock.referenceBasis || !stock.referenceAsOf) {
    return null;
  }
  const ageMs = at.getTime() - stock.referenceAsOf.getTime();
  if (ageMs < 0) return null;
  const basis = stock.referenceBasis as ReferencePriceBasis;
  if (ageMs <= tradeWindowSeconds(stock) * 1000) {
    return { priceMicroUsd: stock.referencePriceMicroUsd, basis, asOf: stock.referenceAsOf, status: "live" };
  }
  if (ageMs <= policy.onchain.reference.displayMaxAgeSeconds * 1000) {
    return { priceMicroUsd: stock.referencePriceMicroUsd, basis, asOf: stock.referenceAsOf, status: "delayed" };
  }
  return null;
}

// The price of one whole token in micro-USD: token_nav is used as-is; share_price
// is the per-share price scaled by the token multiplier.
export function tokenPriceMicroUsd(
  stock: Pick<Stock, "referencePriceMicroUsd" | "referenceBasis" | "multiplierWad">,
): bigint | null {
  if (stock.referencePriceMicroUsd === null || !stock.referenceBasis) return null;
  if (stock.referenceBasis === "token_nav") return stock.referencePriceMicroUsd;
  return (stock.referencePriceMicroUsd * fromDbRaw(stock.multiplierWad)) / WAD;
}

// The price of one share in micro-USD (inverse of the multiplier).
export function sharePriceMicroUsd(stock: Stock): bigint | null {
  const tokenPrice = tokenPriceMicroUsd(stock);
  if (tokenPrice === null) return null;
  return (tokenPrice * WAD) / fromDbRaw(stock.multiplierWad);
}

// The effective per-share price (micro-USD) of an accepted quote's fill:
// buy spends settlement input, sell receives settlement output.
export function effectiveSharePriceMicroUsd(
  stock: Stock,
  side: "buy" | "sell",
  inputRaw: bigint,
  outputRaw: bigint,
): bigint | null {
  if (inputRaw <= 0n || outputRaw <= 0n) return null;
  const pricePerToken =
    side === "buy"
      ? (inputRaw * 10n ** BigInt(stock.decimals)) / outputRaw
      : (outputRaw * 10n ** BigInt(stock.decimals)) / inputRaw;
  return (pricePerToken * WAD) / fromDbRaw(stock.multiplierWad);
}

// On chains with a fill-versus-reference band, a venue quote whose effective price
// per whole token is further than the band from the reference is refused.
export function assertVenueWithinBand(
  stock: Stock,
  side: "buy" | "sell",
  inputRaw: bigint,
  expectedOutputRaw: bigint,
): void {
  const band = policy.onchain.reference.venueBandBps[stock.chain];
  if (band === undefined) return;
  const ref = tokenPriceMicroUsd(stock);
  if (ref === null || ref === 0n || expectedOutputRaw === 0n || inputRaw === 0n) {
    throw new UnprocessableEntityException("Reference price is missing or stale", "REFERENCE_STALE");
  }
  const scale = 10n ** BigInt(stock.decimals);
  const effective =
    side === "buy" ? (inputRaw * scale) / expectedOutputRaw : (expectedOutputRaw * scale) / inputRaw;
  const diff = effective > ref ? effective - ref : ref - effective;
  if ((diff * 10_000n) / ref > BigInt(band)) {
    throw new UnprocessableEntityException("Venue price is outside the reference band", "PRICE_OUT_OF_RANGE");
  }
}
