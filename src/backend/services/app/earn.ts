import type { OnchainOperation, StrategyPosition } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import {
  EARN_AUTOMATION_COPY,
  EARN_MINIMUM_KOBO,
  earnProductCopy,
  productIdForStock,
} from "@/backend/content/earn-products";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { appCatalogService, type AppStockRefDto } from "@/backend/services/app/catalog";
import { toKobo, sharesMicroOf } from "@/backend/services/app/format";
import { customerChainId } from "@/backend/services/app/network";
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

export type AppEarnPositionDto = {
  id: string;
  status: "processing" | "active" | "withdrawing" | "withdrawn" | "action_needed";
  added_kobo: string | null;
  value_kobo: string | null;
  earned_kobo: string;
  joined_at: string;
};

export type AppEarnProductDto = {
  id: string;
  stock: AppStockRefDto;
  title: string;
  summary: string;
  how_it_works: string[];
  risks: string[];
  minimum_kobo: string;
  available: boolean;
  position: AppEarnPositionDto | null;
  documents: ["earn-risks"];
};

export type AppEarnPreviewDto = {
  preview_id: string;
  product_id: string;
  you_add_kobo: string;
  split: { shares_micro: string; cash_kobo: string };
  fees: { label: string; kobo: string | null; note: string | null }[];
  expires_at: string;
  automation: string;
  risk_document: { slug: "earn-risks"; version: string };
};

export type AppEarnWithdrawPreviewDto = {
  preview_id: string;
  position_id: string;
  you_get: { shares_micro: string; cash_kobo: string };
  value_kobo: string | null;
  expires_at: string;
};

const AUTOMATION_ACTIONS = ["claim", "reward_conversion"] as const;
const AUTOMATION_MAX_ACTION_KOBO = 50_000_000n;
const AUTOMATION_MAX_TOTAL_KOBO = 2_000_000_000n;
const AUTOMATION_TTL_MS = 30 * 86_400_000;

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

class AppEarnService {
  async productIdForStock(stockId: string): Promise<string | null> {
    return productIdForStock(stockId);
  }

  private async strategyForProduct(id: string) {
    const strategy = await db.strategy.findUnique({ where: { id } });
    if (!strategy || !strategy.enabled || strategy.experimental || strategy.permanentLock) {
      throw new NotFoundException("Earn product not found");
    }
    const provenance = strategy.provenance as { stockId?: string; chainId?: number } | null;
    const stockId = provenance?.stockId ?? null;
    if (!stockId) throw new NotFoundException("Earn product not found");
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (!stock || !appCatalogService.inCatalog(stock)) {
      throw new NotFoundException("Earn product not found");
    }
    let chainId = provenance?.chainId;
    if (chainId === undefined) {
      const firstAsset = (strategy.inputAssets as string[])[0];
      if (!firstAsset) throw new NotFoundException("Earn product not found");
      chainId = parseAssetKey(firstAsset).chainId;
    }
    if (chainId !== customerChainId()) throw new NotFoundException("Earn product not found");
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
    const earnings = prov?.stockId
      ? await db.earning.findMany({ where: { userId, stockId: prov.stockId } })
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
    const opKey = `strat-op:earn:${userId}:${clientKey}`;
    const existing = await db.onchainOperation.findUnique({ where: { key: opKey } });
    if (existing) {
      const position = await db.strategyPosition.findFirst({
        where: { operationId: existing.id },
        orderBy: { createdAt: "desc" },
      });
      if (position) {
        return { dto: (await this.positionDto(userId, id))!, created: false };
      }
    }
    const { strategy } = await this.strategyForProduct(id);
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
        disclosure_version: CUSTOMER_DOCUMENTS.risks.version,
      },
      `earn:${userId}:${clientKey}:consent`,
    );
    const op = await strategyService.confirm(
      userId,
      quote.id,
      consent.dto.id,
      `earn:${userId}:${clientKey}`,
    );
    // Weekly collection automation, unless an active one already exists.
    const existingAutomation = await db.investmentAuthorization.findFirst({
      where: {
        userId,
        kind: "standing",
        revokedAt: null,
        expiresAt: { gt: now() },
        strategyIds: { has: strategy.id },
      },
    });
    if (!existingAutomation) {
      const prov = strategy.provenance as { stockId?: string } | null;
      await authorizationService.create(
        userId,
        {
          kind: "standing",
          stock_ids: prov?.stockId ? [prov.stockId] : [],
          strategy_ids: [strategy.id],
          actions: [...AUTOMATION_ACTIONS],
          max_action_ngn: AUTOMATION_MAX_ACTION_KOBO,
          max_total_ngn: AUTOMATION_MAX_TOTAL_KOBO,
          max_fee_bps: 100,
          max_slippage_bps: 100,
          expires_at: new Date(now().getTime() + AUTOMATION_TTL_MS).toISOString(),
          policy_version: policy.app.policyVersion,
          disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
        },
        `earn-automation:${userId}:${strategy.id}`,
      );
    }
    void op;
    const dto = await this.positionDto(userId, strategy.id);
    if (!dto) throw new NotFoundException("Position not found");
    return { dto, created: true };
  }

  async withdrawPreview(userId: string, positionId: string): Promise<AppEarnWithdrawPreviewDto> {
    const position = await db.strategyPosition.findUnique({ where: { id: positionId } });
    if (position?.userId !== userId) {
      throw new NotFoundException("Position not found");
    }
    const strategy = await db.strategy.findUniqueOrThrow({ where: { id: position.strategyId } });
    const prov = strategy.provenance as { stockId?: string } | null;
    const stock = prov?.stockId ? await db.stock.findUnique({ where: { id: prov.stockId } }) : null;
    const rate = await payoutRateOrNull();
    const display = await ratesService.display();
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
        cash_kobo: cashOut ? toKobo(BigInt(cashOut.raw), display.depositRate).toString() : "0",
      },
      value_kobo:
        position.valueUsdc === null || rate === null
          ? null
          : toKobo(fromDbRaw(position.valueUsdc), rate).toString(),
      expires_at: quote.expires_at,
    };
  }

  async withdraw(
    userId: string,
    positionId: string,
    input: { previewId: string; pin: string },
    clientKey: string,
  ): Promise<{ dto: AppEarnPositionDto; created: boolean }> {
    const opKey = `strat-op:earn-withdraw:${userId}:${clientKey}`;
    const existing = await db.onchainOperation.findUnique({ where: { key: opKey } });
    const position = await db.strategyPosition.findUnique({ where: { id: positionId } });
    if (position?.userId !== userId) {
      throw new NotFoundException("Position not found");
    }
    if (existing) {
      return { dto: (await this.positionDto(userId, position.strategyId))!, created: false };
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
        disclosure_version: CUSTOMER_DOCUMENTS.risks.version,
      },
      `earn-withdraw:${userId}:${clientKey}:consent`,
    );
    await strategyService.confirm(
      userId,
      quote.id,
      consent.dto.id,
      `earn-withdraw:${userId}:${clientKey}`,
    );
    const dto = await this.positionDto(userId, position.strategyId);
    if (!dto) throw new NotFoundException("Position not found");
    return { dto, created: true };
  }
}

export const appEarnService = new AppEarnService();
