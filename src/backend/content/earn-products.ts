import { db } from "@/server/db";
import { chainIdForLedgerChain, customerChainId } from "@/backend/services/app/network";
import { STOCK_PROFILES } from "@/backend/content/stock-profiles";
import { parseAssetKey } from "@/backend/services/onchain/types";

// Plain-language copy for an Earn product; {s} is the stock's profile name.
export function earnProductCopy(stockName: string): {
  title: string;
  summary: string;
  how_it_works: [string, string, string];
  risks: [string, string, string];
} {
  return {
    title: `Earn from ${stockName} trading fees`,
    summary: `Add money to a trading pool for ${stockName} shares and earn a share of the fees each time people trade.`,
    how_it_works: [
      `We split your money into ${stockName} shares and cash and add both to a trading pool.`,
      "Every trade in the pool pays a small fee. Your share of the fees is collected every week.",
      "Withdraw any time. You get back shares and cash in whatever mix the pool holds then.",
    ],
    risks: [
      `You can get back less than you put in if the price of ${stockName} moves a lot.`,
      "Fees are not guaranteed. Quiet weeks can earn nothing.",
      "During the beta, fees come mostly from test trading and have no real value.",
    ],
  };
}

export const EARN_AUTOMATION_COPY =
  "We'll collect your fees every Thursday night and add them to your earnings. You can turn this off in Settings.";

export const EARN_LIMIT_LINES = [
  "Converting your earnings to naira costs at most 1%.",
  "The exchange rate spread is at most 2%.",
  "Payouts of ₦2,000 or more go out every Friday. Smaller amounts roll over.",
];

export const EARN_MINIMUM_KOBO = 500_000n;

// The customer-network Earn product for a catalog stock, if one exists.
export async function productIdForStock(stockId: string): Promise<string | null> {
  const stock = await db.stock.findUnique({ where: { id: stockId } });
  if (
    !stock ||
    !stock.enabled ||
    stock.delisted ||
    !stock.displayTicker ||
    !(stock.displayTicker in STOCK_PROFILES) ||
    chainIdForLedgerChain(stock.chain) !== customerChainId()
  ) {
    return null;
  }
  const strategies = await db.strategy.findMany({
    where: { enabled: true, experimental: false, permanentLock: false },
  });
  for (const strategy of strategies) {
    const provenance = strategy.provenance as { stockId?: string; chainId?: number } | null;
    if (provenance?.stockId !== stockId) continue;
    let chainId = provenance.chainId;
    if (chainId === undefined) {
      const firstAsset = (strategy.inputAssets as string[])[0];
      if (!firstAsset) continue;
      chainId = parseAssetKey(firstAsset).chainId;
    }
    if (chainId !== customerChainId()) continue;
    return strategy.id;
  }
  return null;
}
