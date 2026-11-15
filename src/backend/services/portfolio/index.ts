import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { integrationModes } from "@/backend/integrations/beta-policy";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { ratesService } from "@/backend/services/rates";
import { stockActionService, tokenPriceFromSharePrice } from "@/backend/services/stocks/corporate-actions";
import { referenceUsable } from "@/backend/services/stocks/reference";
import { tradeRouter } from "@/backend/services/trades/router";
import { positionService } from "@/backend/services/positions";
import { rewardService } from "@/backend/services/rewards";
import { betaDto, type PortfolioDto, type PortfolioHoldingDto } from "@/types/dto";
import { formatMinor, rateToDto, usdToNgn, type Rate } from "@/utils/money";

class PortfolioService {
  async get(userId: string): Promise<PortfolioDto> {
    const localWallet = await db.wallet.findFirst({ where: { userId, executionAddress: { not: null } } });
    const chain = localWallet ? "testnet" : policy.defaultChain;
    const balances = await ledgerService.balancesForUser(userId);
    const cash = balances.get(acct.userCash(userId, chain).code) ?? 0n;
    const reserved = balances.get(acct.userReserved(userId, chain).code) ?? 0n;
    const pending = balances.get(acct.userPending(userId).code) ?? 0n;
    const earnings = balances.get(acct.userEarnings(userId, chain).code) ?? 0n;

    let rate: PortfolioDto["rate"] = null;
    let valuation: PortfolioDto["valuation"] = "ok";
    let payoutRate: Rate | null = null;
    try {
      const display = await ratesService.display();
      rate = rateToDto(display.payoutRate);
      payoutRate = display.payoutRate;
    } catch {
      valuation = "unavailable";
    }

    const toNgn = (microUsdc: bigint): string | null => {
      if (!payoutRate) return null;
      return formatMinor(usdToNgn(microUsdc, payoutRate, "floor"));
    };

    // Paused/delisted owned assets stay visible in totals.
    const stocks = await db.stock.findMany();
    const holdings: PortfolioHoldingDto[] = [];
    for (const stock of stocks) {
      const quantity = (balances.get(acct.userStock(userId, stock.id).code) ?? 0n) + (balances.get(acct.userStockReserved(userId, stock.id).code) ?? 0n);
      if (quantity <= 0n) continue;
      let priceUsdc: string | null = null;
      let valueUsdc: string | null = null;
      try {
        let price: bigint;
        if (stock.networkId) {
          if (stock.referencePriceMicroUsd === null || !referenceUsable(stock, now())) throw new Error("Reference unavailable");
          price = stock.referenceBasis === "token_nav" ? stock.referencePriceMicroUsd : tokenPriceFromSharePrice(stock.referencePriceMicroUsd, await stockActionService.effectiveMultiplier(stock.id, now()));
        } else price = await tradeRouter.priceOneShare(stock);
        priceUsdc = formatMinor(price);
        const scale = 10n ** BigInt(stock.decimals);
        valueUsdc = formatMinor((quantity * price) / scale);
      } catch {
        valuation = valuation === "unavailable" ? "unavailable" : "partial";
      }
      holdings.push({
        stock_id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        quantity: quantity.toString(),
        decimals: stock.decimals,
        price_usdc: priceUsdc,
        value_usdc: valueUsdc,
        value_ngn: valueUsdc === null ? null : toNgn(BigInt(valueUsdc)),
      });
    }

    return {
      cash_usdc: formatMinor(cash),
      reserved_usdc: formatMinor(reserved),
      pending_usdc: formatMinor(pending),
      earnings_usdc: formatMinor(earnings),
      cash_ngn: toNgn(cash),
      pending_ngn: toNgn(pending),
      earnings_ngn: toNgn(earnings),
      holdings,
      positions: await positionService.list(userId),
      rate,
      valuation,
      as_of: now().toISOString(),
      beta: betaDto(integrationModes().yellowcard),
      receipts: await rewardService.listForUser(userId),
    };
  }
}

export const portfolioService = new PortfolioService();
