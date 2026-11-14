import type { Stock, TradeSide } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import type { Venue } from "@/backend/services/trades/venue";
import { sha256Hex } from "@/utils";
import { fromDbRawNullable, toDbRaw } from "@/utils/asset-units";

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export function swapAmountOut(stock: Stock, side: TradeSide, amountIn: bigint): bigint {
  const scale = 10n ** BigInt(stock.decimals);
  const price = stock.simPriceMicroUsdc;
  if (price <= 0n) return 0n;
  return side === "buy" ? (amountIn * scale) / price : (amountIn * price) / scale;
}

async function hasFault(scope: string, key: string): Promise<boolean> {
  const fault = await db.simFault.findUnique({ where: { scope_key: { scope, key } } });
  return fault !== null;
}

const venue: Venue = {
  id: "sim-base",
  chain: "base",

  async quote(i) {
    const amountOut = swapAmountOut(i.stock, i.side, i.amountIn);
    const impact = i.key && (await hasFault("swap_impact", i.key)) ? 150 : 0;
    return {
      amountOut,
      priceImpactBps: impact,
      expiresAt: new Date(now().getTime() + 60_000),
    };
  },

  async quoteExactOut(i) {
    const scale = 10n ** BigInt(i.stock.decimals);
    const price = i.stock.simPriceMicroUsdc;
    const amountIn =
      i.side === "buy"
        ? ceilDiv(i.amountOut * price, scale)
        : ceilDiv(i.amountOut * scale, price);
    return { amountIn };
  },

  async submitSwap(i) {
    const existing = await db.simSwap.findUnique({ where: { key: i.key } });
    if (existing) return { ref: existing.id };
    const amountOut = swapAmountOut(i.stock, i.side, i.amountIn);
    const row = await db.simSwap.create({
      data: {
        key: i.key,
        venueId: venue.id,
        stockId: i.stock.id,
        side: i.side,
        amountIn: toDbRaw(i.amountIn),
        minAmountOut: toDbRaw(i.minAmountOut),
        amountOut: toDbRaw(amountOut),
        status: "pending",
        settleAt: new Date(now().getTime() + policy.sim.yellowcard.settleSeconds * 1_000),
      },
    });
    return { ref: row.id };
  },

  async getSwap(key) {
    const row = await db.simSwap.findUnique({ where: { key } });
    if (!row) return null;
    const amountOut = fromDbRawNullable(row.amountOut);
    const minAmountOut = fromDbRawNullable(row.minAmountOut) ?? 0n;
    if (await hasFault("swap", key)) {
      return {
        status: "failed",
        amountOut,
        failureReason: "REVERTED",
        ref: row.id,
      };
    }
    if (now() < row.settleAt) {
      return { status: "pending", amountOut, failureReason: null, ref: row.id };
    }
    if (amountOut !== null && amountOut < minAmountOut) {
      return {
        status: "failed",
        amountOut,
        failureReason: "REVERTED",
        ref: row.id,
      };
    }
    return { status: "filled", amountOut, failureReason: null, ref: row.id };
  },
};

export const simulatedVenue: Venue = venue;

export const simVenue = {
  async addFault(scope: "swap" | "swap_impact", key: string): Promise<void> {
    await db.$executeRawUnsafe(
      `INSERT INTO "sim_faults" (id, scope, key) VALUES ($1, $2, $3) ON CONFLICT (scope, key) DO NOTHING`,
      `fault-${sha256Hex(`${scope}:${key}`).slice(0, 24)}`,
      scope,
      key,
    );
  },
};
