import type { Stock, TradeSide, Wallet } from "@/server/prisma";

import type { Chain } from "@/backend/services/wallets/chains";

export interface Venue {
  readonly id: string;
  readonly chain: Chain;
  quote(i: {
    stock: Stock;
    side: TradeSide;
    amountIn: bigint;
    key?: string;
  }): Promise<{ amountOut: bigint; priceImpactBps: number; expiresAt: Date }>;
  quoteExactOut(i: {
    stock: Stock;
    side: TradeSide;
    amountOut: bigint;
  }): Promise<{ amountIn: bigint }>;
  submitSwap(i: {
    key: string;
    wallet: Wallet;
    stock: Stock;
    side: TradeSide;
    amountIn: bigint;
    minAmountOut: bigint;
  }): Promise<{ ref: string }>;
  getSwap(
    key: string,
  ): Promise<{
    status: "pending" | "filled" | "failed";
    amountOut: bigint | null;
    failureReason: string | null;
    ref: string | null;
  } | null>;
}
