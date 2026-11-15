import type { Stock, TradeSide } from "@/server/prisma";
import { simulatedVenue } from "@/backend/services/simulator/venue";
import { ConflictException } from "@/utils/exceptions";

import type { Venue } from "./venue";

const venues: readonly Venue[] = [simulatedVenue];

class TradeRouter {
  async route(i: {
    stock: Stock;
    side: TradeSide;
    amountIn: bigint;
    key?: string;
  }): Promise<{ venue: Venue; amountOut: bigint; priceImpactBps: number }> {
    let best: { venue: Venue; amountOut: bigint; priceImpactBps: number } | null = null;
    for (const venue of venues) {
      const q = await venue.quote({
        stock: i.stock,
        side: i.side,
        amountIn: i.amountIn,
        key: i.key,
      });
      if (!best || q.amountOut > best.amountOut) {
        best = { venue, amountOut: q.amountOut, priceImpactBps: q.priceImpactBps };
      }
    }
    if (!best) {
      throw new ConflictException("No venue can route this trade", "NO_ROUTE");
    }
    return best;
  }

  async priceOneShare(stock: Stock): Promise<bigint> {
    const routed = await this.route({
      stock,
      side: "sell",
      amountIn: 10n ** BigInt(stock.decimals),
    });
    return routed.amountOut;
  }

  venueById(id: string): Venue {
    const venue = venues.find((v) => v.id === id);
    if (!venue) throw new ConflictException("Unknown venue", "NO_ROUTE");
    return venue;
  }
}

export const tradeRouter = new TradeRouter();
