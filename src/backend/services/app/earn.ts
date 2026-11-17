import type { OnchainOperation, Stock, Strategy, StrategyPosition } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import {
  EARN_AUTOMATION_COPY,
  EARN_MINIMUM_KOBO,
  earnProductCopy,
} from "@/backend/content/earn-products";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { appCatalogService } from "@/backend/services/app/catalog";
import { toKobo, sharesMicroOf } from "@/backend/services/app/format";
import { customerChain, customerChainId } from "@/backend/services/app/network";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { agreementService } from "@/backend/services/agreements";
import { authorizationService } from "@/backend/services/authorizations";
import { ratesService } from "@/backend/services/rates";
import { securityService } from "@/backend/services/security";
import { strategyService } from "@/backend/services/strategies";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { referenceUsable } from "@/backend/services/stocks/reference";
import { fromDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@/utils/exceptions";
import { ngnToUsd, type Rate } from "@/utils/money";
import type { AppEarnPositionDto, AppEarnProductDto, AppEarnPreviewDto, AppEarnWithdrawPreviewDto } from "@/types/app";

export type { AppEarnPositionDto, AppEarnProductDto, AppEarnPreviewDto, AppEarnWithdrawPreviewDto } from "@/types/app";

const AUTOMATION_ACTIONS = ["claim", "reward_conversion"] as const;
const DAY_MS = 86_400_000;

async function payoutRateOrNull(): Promise<Rate | null> {
  try {
    return (await ratesService.display()).payoutRate;
  } catch {
    return null;
  }
}

function positionStatus(position: StrategyPosition, op: OnchainOperation | null): AppEarnPositionDto["status"] {
  if (position.state === "needs_review") return "action_needed";
  if (position.state === "exited") return "withdrawn";
  if (position.state === "exit_pending") return "withdrawing";
  if (position.state === "active") return "active";
  void op;
  return "processing";
}

// The network an Earn strategy runs on: its provenance chain, else the chain of
// its first input asset.
function strategyChainId(strategy: Strategy): number | null {
  const provenance = strategy.provenance as { chainId?: number } | null;
  if (provenance?.chainId !== undefined) return provenance.chainId;
  const firstAsset = (strategy.inputAssets as string[])[0];
  return firstAsset ? parseAssetKey(firstAsset).chainId : null;
}

function strategyStockId(strategy: Strategy): string | null {
  const provenance = strategy.provenance as { stockId?: string } | null;
  return provenance?.stockId ?? null;
}

// Offered to customers: enabled, never experimental or permanently locked.
function offerable(strategy: Strategy): boolean {
  return strategy.enabled && !strategy.experimental && !strategy.permanentLock;
}

class AppEarnService {
  // The customer-network Earn product for a catalog stock, if one exists.
  async productIdForStock(stockId: string): Promise<string | null> {
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (stock?.chain !== customerChain() || !appCatalogService.inCatalog(stock)) {
      return null;
    }
    const strategies = await db.strategy.findMany({
      where: { enabled: true, experimental: false, permanentLock: false },
      orderBy: { createdAt: "asc" },
    });
    const match = strategies.find(
      (strategy) =>
        strategyStockId(strategy) === stockId && strategyChainId(strategy) === customerChainId(),
    );
    return match?.id ?? null;
  }

  private async strategyForProduct(id: string): Promise<{ strategy: Strategy; stock: Stock }> {
    const strategy = await db.strategy.findUnique({ where: { id } });
    if (!strategy || !offerable(strategy)) {
      throw new NotFoundException("Earn product not found");
    }
    const stockId = strategyStockId(strategy);
    if (!stockId) throw new NotFoundException("Earn product not found");
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (!stock || !appCatalogService.inCatalog(stock)) {
      throw new NotFoundException("Earn product not found");
    }
    if (strategyChainId(strategy) !== customerChainId()) {
      throw new NotFoundException("Earn product not found");
    }
    return { strategy, stock };
  }

  private async positionDto(userId: string, strategyId: string): Promise<AppEarnPositionDto | null> {
    const position = await db.strategyPosition.findFirst({
      where: {
        userId,
        strategyId,
        state: { in: ["reserved", "executing", "active", "exit_pending", "needs_review", "exited"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!position) return null;
    const op = position.operationId
      ? await db.onchainOperation.findUnique({ where: { id: position.operationId } })
      : null;
    const rate = await payoutRateOrNull();
    const strategy = await db.strategy.findUniqueOrThrow({ where: { id: strategyId } });
    const prov = strategy.provenance as { stockId?: string } | null;
    // Recognized receipts only: onchain fee earnings for this product's stock.
    const earnings = prov?.stockId
      ? await db.earning.findMany({
          where: { userId, stockId: prov.stockId, receiptId: { not: null } },
        })
      : [];
    const earnedMicro = earnings.reduce((sum, e) => sum + BigInt(e.amountUsdc), 0n);
    return {
      id: position.id,
      status: positionStatus(position, op),
      added_kobo:
        rate === null ? null : toKobo(fromDbRaw(position.principalUsdc), rate).toString(),
      value_kobo:
        position.valueUsdc === null || rate === null
          ? null
          : toKobo(fromDbRaw(position.valueUsdc), rate).toString(),
      earned_kobo: rate === null ? "0" : toKobo(earnedMicro, rate).toString(),
      joined_at: position.createdAt.toISOString(),
    };
  }

  private async productDto(userId: string, strategyId: string): Promise<AppEarnProductDto> {
    const { strategy, stock } = await this.strategyForProduct(strategyId);
    const copy = earnProductCopy(appCatalogService.stockRef(stock).name);
    const positionRow = await db.strategyPosition.findFirst({
      where: { userId, strategyId },
      orderBy: { createdAt: "desc" },
    });
    const available = !stock.paused && !stock.delisted && referenceUsable(stock, now());
    return {
      id: strategy.id,
      stock: appCatalogService.stockRef(stock),
      title: copy.title,
      summary: copy.summary,
      how_it_works: copy.how_it_works,
      risks: copy.risks,
      minimum_kobo: EARN_MINIMUM_KOBO.toString(),
      available,
      position: positionRow ? await this.positionDto(userId, strategyId) : null,
      documents: ["earn-risks"],
    };
  }

  async products(userId: string): Promise<AppEarnProductDto[]> {
    const strategies = await db.strategy.findMany({
      where: { enabled: true, experimental: false, permanentLock: false },
    });
    const out: AppEarnProductDto[] = [];
    for (const strategy of strategies) {
      try {
        out.push(await this.productDto(userId, strategy.id));
      } catch (error) {
        if (error instanceof NotFoundException) continue;
        throw error;
      }
    }
    out.sort((a, b) => a.title.localeCompare(b.title));
    return out;
  }

  async product(userId: string, id: string): Promise<AppEarnProductDto> {
    return this.productDto(userId, id);
  }

  async preview(userId: string, id: string, amountKobo: bigint): Promise<AppEarnPreviewDto> {
    if (amountKobo < EARN_MINIMUM_KOBO) {
      throw new UnprocessableEntityException("Below the minimum", "BELOW_MINIMUM");
    }
    const { strategy, stock } = await this.strategyForProduct(id);
    const display = await ratesService.display();
    const quote = await strategyService.quote(userId, {
      strategyId: strategy.id,
      action: "enter",
      budgetInputRaw: ngnToUsd(amountKobo, display.depositRate, "floor"),
    });
    // An enter quote splits the budget into a stock leg and a cash leg, both in
    // maximum_inputs (minimum_outputs stay empty until the position is valued).
    const sharesOut = quote.maximum_inputs.find((o) => o.asset === stock.assetKey);
    const cashOut = quote.maximum_inputs.find((o) => o.asset !== stock.assetKey);
    const feeKobo = toKobo(BigInt(quote.user_fee_usdc), display.depositRate).toString();
    return {
      preview_id: quote.id,
      product_id: strategy.id,
      you_add_kobo: amountKobo.toString(),
      split: {
        shares_micro: sharesOut ? sharesMicroOf(BigInt(sharesOut.raw), stock.decimals).toString() : "0",
        cash_kobo: cashOut ? toKobo(BigInt(cashOut.raw), display.depositRate).toString() : "0",
      },
      fees: [{ label: "V3ST fee", kobo: feeKobo, note: null }],
      expires_at: quote.expires_at,
      automation: EARN_AUTOMATION_COPY,
      risk_document: { slug: "earn-risks", version: CUSTOMER_DOCUMENTS["earn-risks"].version },
    };
  }

  async join(
    userId: string,
    id: string,
    input: { previewId: string; pin: string; acceptedRiskVersion: string },
    clientKey: string,
  ): Promise<{ dto: AppEarnPositionDto; created: boolean }> {
    // Replay first, like orders: the same Idempotency-Key with the same preview
    // returns the stored position without a PIN check; another preview is refused.
    const key = `app-earn:${userId}:${clientKey}`;
    const existing = await db.onchainOperation.findUnique({ where: { key: `strat-op:${key}` } });
    if (existing) {
      if (existing.userId !== userId || existing.quoteId !== input.previewId) {
        throw new ConflictException(
          "Idempotency key reused with a different preview",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      const replayed = await this.positionDto(userId, id);
      if (replayed) return { dto: replayed, created: false };
    }
    const { strategy, stock } = await this.strategyForProduct(id);
    if (input.acceptedRiskVersion !== CUSTOMER_DOCUMENTS["earn-risks"].version) {
      throw new ConflictException(
        "The Earn risks document was updated; accept the latest version",
        "AGREEMENT_OUTDATED",
      );
    }
    await agreementService.accept(userId, [
      { slug: "earn-risks", version: input.acceptedRiskVersion },
    ]);
    await appOnboardingService.assertReady(userId, "earn");
    await securityService.verifyPin(userId, input.pin);
    const quote = await db.strategyQuote.findUnique({ where: { id: input.previewId } });
    if (quote?.userId !== userId || quote?.strategyId !== strategy.id) {
      throw new NotFoundException("Preview not found");
    }
    const consent = await authorizationService.create(
      userId,
      {
        kind: "one_time",
        quote_kind: "strategy",
        quote_id: quote.id,
        policy_version: policy.app.policyVersion,
        disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
      },
      `${key}:consent`,
    );
    await strategyService.confirm(userId, quote.id, consent.dto.id, key);
    await this.ensureAutomation(userId, strategy, stock, key);
    const dto = await this.positionDto(userId, strategy.id);
    if (!dto) throw new NotFoundException("Position not found");
    return { dto, created: true };
  }

  // Weekly fee collection for the product, unless an active automation already
  // covers it. Keyed by the join that created it, so turning it off and joining
  // again sets up a fresh one.
  private async ensureAutomation(
    userId: string,
    strategy: Strategy,
    stock: Stock,
    joinKey: string,
  ): Promise<void> {
    const automation = policy.app.earn.automation;
    const active = await db.investmentAuthorization.findFirst({
      where: {
        userId,
        kind: "standing",
        revokedAt: null,
        expiresAt: { gt: now() },
        strategyIds: { has: strategy.id },
        actions: { hasEvery: [...AUTOMATION_ACTIONS] },
      },
    });
    if (active) return;
    await authorizationService.create(
      userId,
      {
        kind: "standing",
        stock_ids: [stock.id],
        strategy_ids: [strategy.id],
        actions: [...AUTOMATION_ACTIONS],
        max_action_ngn: automation.perActionCapKobo,
        max_total_ngn: automation.totalCapKobo,
        max_fee_bps: policy.app.orders.consent.maxFeeBps,
        max_slippage_bps: policy.app.orders.consent.maxSlippageBps,
        expires_at: new Date(now().getTime() + automation.expiryDays * DAY_MS).toISOString(),
        policy_version: policy.app.policyVersion,
        disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
      },
      `${joinKey}:automation`,
    );
  }

  async withdrawPreview(userId: string, positionId: string): Promise<AppEarnWithdrawPreviewDto> {
    const position = await db.strategyPosition.findUnique({ where: { id: positionId } });
    if (position?.userId !== userId) {
      throw new NotFoundException("Position not found");
    }
    const strategy = await db.strategy.findUniqueOrThrow({ where: { id: position.strategyId } });
    const prov = strategy.provenance as { stockId?: string } | null;
    const stock = prov?.stockId ? await db.stock.findUnique({ where: { id: prov.stockId } }) : null;
    // What comes back is valued like any other holding: at the payout rate.
    const payoutRate = (await ratesService.display()).payoutRate;
    const quote = await strategyService.quote(userId, { positionId, action: "exit" });
    const sharesOut = stock?.assetKey
      ? quote.minimum_outputs.find((o) => o.asset === stock.assetKey)
      : undefined;
    const cashOut = quote.minimum_outputs.find((o) => !stock?.assetKey || o.asset !== stock.assetKey);
    return {
      preview_id: quote.id,
      position_id: position.id,
      you_get: {
        shares_micro:
          stock && sharesOut ? sharesMicroOf(BigInt(sharesOut.raw), stock.decimals).toString() : "0",
        cash_kobo: cashOut ? toKobo(BigInt(cashOut.raw), payoutRate).toString() : "0",
      },
      value_kobo:
        position.valueUsdc === null
          ? null
          : toKobo(fromDbRaw(position.valueUsdc), payoutRate).toString(),
      expires_at: quote.expires_at,
    };
  }

  async withdraw(
    userId: string,
    positionId: string,
    input: { previewId: string; pin: string },
    clientKey: string,
  ): Promise<{ dto: AppEarnPositionDto; created: boolean }> {
    const position = await db.strategyPosition.findUnique({ where: { id: positionId } });
    if (position?.userId !== userId) {
      throw new NotFoundException("Position not found");
    }
    const key = `app-earn-withdraw:${userId}:${clientKey}`;
    const existing = await db.onchainOperation.findUnique({ where: { key: `strat-op:${key}` } });
    if (existing) {
      if (existing.userId !== userId || existing.quoteId !== input.previewId) {
        throw new ConflictException(
          "Idempotency key reused with a different preview",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      const replayed = await this.positionDto(userId, position.strategyId);
      if (replayed) return { dto: replayed, created: false };
    }
    await appOnboardingService.assertReady(userId, "earn");
    await securityService.verifyPin(userId, input.pin);
    const quote = await db.strategyQuote.findUnique({ where: { id: input.previewId } });
    if (quote?.userId !== userId || quote?.positionId !== positionId) {
      throw new NotFoundException("Preview not found");
    }
    const consent = await authorizationService.create(
      userId,
      {
        kind: "one_time",
        quote_kind: "strategy",
        quote_id: quote.id,
        policy_version: policy.app.policyVersion,
        disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
      },
      `${key}:consent`,
    );
    await strategyService.confirm(userId, quote.id, consent.dto.id, key);
    const dto = await this.positionDto(userId, position.strategyId);
    if (!dto) throw new NotFoundException("Position not found");
    return { dto, created: true };
  }
}

export const appEarnService = new AppEarnService();
