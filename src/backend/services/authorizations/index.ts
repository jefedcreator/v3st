import { type InvestmentAuthorization, type Prisma } from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { ratesService } from "@/backend/services/rates";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import type { AuthorizationCreateBodySchema } from "@/backend/validators/authorization.validator";
import { usdToNgn } from "@/utils/money";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

// Inferred from the strict Task-4 validator: a one-time/standing union.
export type AuthorizationInput = AuthorizationCreateBodySchema;

export type StandingAction =
  | "claim"
  | "reward_conversion"
  | "reinvest"
  | "withdrawal_sale"
  | "order_buy"
  | "order_sell";

export type AuthorizationUsage = {
  // Present when a standing authorization is used; one-time authorizations are
  // bound to their quote instead.
  action?: StandingAction;
  quote?: {
    kind: "investment" | "strategy";
    id: string;
    stockId?: string | null;
    strategyId?: string | null;
    valueMicroUsd: bigint;
    budgetNgnKobo?: bigint | null;
    feeMicroUsd?: bigint;
    slippageBps?: number;
    // Effective per-share price of the accepted fill; required for order actions.
    effectivePriceMicroUsd?: bigint;
  };
};

export type AuthorizationDto = {
  id: string;
  kind: "one_time" | "standing";
  quote_kind: string | null;
  quote_id: string | null;
  stock_ids: string[];
  strategy_ids: string[];
  actions: string[];
  max_action_ngn: string | null;
  max_total_ngn: string | null;
  max_fee_bps: number | null;
  max_slippage_bps: number | null;
  expires_at: string;
  revoked_at: string | null;
  epoch: number;
  policy_version: string;
  disclosure_version: string | null;
  beta_context: unknown;
  created_at: string;
};

// Held reservations and completed spending count against a standing total cap.
const ACTIVE_OP_STATUSES = [
  "pending",
  "prepared",
  "signed",
  "broadcast",
  "confirmed",
  "unknown",
  "needs_review",
  "finalized",
] as const;

export function authorizationToDto(row: {
  id: string;
  kind: string;
  quoteKind: string | null;
  quoteId: string | null;
  stockIds: string[];
  strategyIds: string[];
  actions: string[];
  maxActionNgn: Prisma.Decimal | null;
  maxTotalNgn: Prisma.Decimal | null;
  maxFeeBps: number | null;
  maxSlippageBps: number | null;
  expiresAt: Date;
  revokedAt: Date | null;
  epoch: number;
  policyVersion: string;
  disclosureVersion: string | null;
  betaContext: Prisma.JsonValue | null;
  createdAt: Date;
}): AuthorizationDto {
  return {
    id: row.id,
    kind: row.kind as "one_time" | "standing",
    quote_kind: row.quoteKind,
    quote_id: row.quoteId,
    stock_ids: row.stockIds,
    strategy_ids: row.strategyIds,
    actions: row.actions,
    max_action_ngn: row.maxActionNgn === null ? null : fromDbRaw(row.maxActionNgn).toString(),
    max_total_ngn: row.maxTotalNgn === null ? null : fromDbRaw(row.maxTotalNgn).toString(),
    max_fee_bps: row.maxFeeBps,
    max_slippage_bps: row.maxSlippageBps,
    expires_at: row.expiresAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
    epoch: row.epoch,
    policy_version: row.policyVersion,
    disclosure_version: row.disclosureVersion,
    beta_context: row.betaContext ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

class AuthorizationService {
  async create(
    userId: string,
    input: AuthorizationInput,
    idempotencyKey: string,
  ): Promise<{ dto: AuthorizationDto; created: boolean }> {
    const key = `auth:${userId}:${idempotencyKey}`;
    const requestHash = sha256Hex(canonicalJson(input));
    const existing = await db.investmentAuthorization.findUnique({ where: { key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException("Idempotency key reused with a different body", "IDEMPOTENCY_KEY_REUSED");
      }
      return { dto: authorizationToDto(existing), created: false };
    }

    let data: Prisma.InvestmentAuthorizationCreateInput;
    if (input.kind === "one_time") {
      // One-time consent binds to one owned persisted quote; every limit resolves
      // from that quote at use time.
      const quote =
        input.quote_kind === "investment"
          ? await db.investmentQuote.findUnique({ where: { id: input.quote_id } })
          : await db.strategyQuote.findUnique({ where: { id: input.quote_id } });
      if (quote?.userId !== userId) {
        throw new NotFoundException("Quote not found", "NOT_FOUND");
      }
      if (quote.consumedAt) {
        throw new ConflictException("Quote already consumed", "QUOTE_CONSUMED");
      }
      if (quote.expiresAt <= now()) {
        throw new ConflictException("Quote expired", "QUOTE_EXPIRED");
      }
      const betaContext = (quote.context as { betaContext?: unknown } | null)?.betaContext ?? null;
      data = {
        userId,
        key,
        kind: "one_time",
        quoteKind: input.quote_kind,
        quoteId: quote.id,
        stockIds: [],
        strategyIds: [],
        actions: [],
        expiresAt: quote.expiresAt,
        policyVersion: input.policy_version,
        disclosureVersion: input.disclosure_version,
        betaContext: betaContext as Prisma.InputJsonValue,
        requestHash,
      };
    } else {
      const expiresAt = new Date(input.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now()) {
        throw new UnprocessableEntityException("expires_at must be a future ISO timestamp", "VALIDATION_FAILED");
      }
      if (expiresAt.getTime() > now().getTime() + policy.onchain.authorizationMaxDays * 86_400_000) {
        throw new UnprocessableEntityException(
          `expires_at must be at most ${policy.onchain.authorizationMaxDays} days away`,
          "VALIDATION_FAILED",
        );
      }
      data = {
        userId,
        key,
        kind: "standing",
        stockIds: input.stock_ids,
        strategyIds: input.strategy_ids,
        actions: [...input.actions],
        maxActionNgn: toDbRaw(input.max_action_ngn),
        maxTotalNgn: toDbRaw(input.max_total_ngn),
        maxFeeBps: input.max_fee_bps,
        maxSlippageBps: input.max_slippage_bps,
        expiresAt,
        policyVersion: input.policy_version,
        disclosureVersion: input.disclosure_version,
        requestHash,
      };
    }
    const row = await db.investmentAuthorization.create({ data });
    return { dto: authorizationToDto(row), created: true };
  }

  async list(userId: string): Promise<AuthorizationDto[]> {
    const rows = await db.investmentAuthorization.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(authorizationToDto);
  }

  async getOwned(userId: string, id: string): Promise<AuthorizationDto> {
    const row = await db.investmentAuthorization.findUnique({ where: { id } });
    if (row?.userId !== userId) {
      throw new NotFoundException("Authorization not found", "NOT_FOUND");
    }
    return authorizationToDto(row);
  }

  async revoke(userId: string, id: string): Promise<AuthorizationDto> {
    return withTx(async (tx) => {
      const row = await tx.investmentAuthorization.findUnique({ where: { id } });
      if (row?.userId !== userId) {
        throw new NotFoundException("Authorization not found", "NOT_FOUND");
      }
      if (row.revokedAt) return authorizationToDto(row);
      // Revocation blocks new signing; already-broadcast work is never relabelled
      // as cancelled and reconciles onchain.
      const updated = await tx.investmentAuthorization.update({
        where: { id: row.id },
        data: { revokedAt: now(), epoch: row.epoch + 1 },
      });
      return authorizationToDto(updated);
    }).then(async (dto) => {
      await testnetWalletService.bumpAuthorizationEpoch(userId).catch(() => undefined);
      return dto;
    });
  }

  // Re-validated before signing: ownership, active state and expiry.
  async assertActive(tx: Tx, userId: string, authorizationId: string): Promise<void> {
    const auth = await tx.investmentAuthorization.findUnique({ where: { id: authorizationId } });
    if (auth?.userId !== userId) {
      throw new NotFoundException("Authorization not found", "NOT_FOUND");
    }
    if (auth.revokedAt) {
      throw new ConflictException("Authorization revoked", "AUTHORIZATION_REVOKED");
    }
    if (auth.expiresAt <= now()) {
      throw new ConflictException("Authorization expired", "AUTHORIZATION_EXPIRED");
    }
  }

  // Records the naira value reserved against a standing cap, attached to the
  // operation so the cumulative total recomputes atomically under the auth lock.
  async recordUsage(tx: Tx, operationId: string, ngnKobo: bigint): Promise<void> {
    const op = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    const expected = (op.expected as Record<string, unknown>) ?? {};
    expected.usageNgnKobo = ngnKobo.toString();
    await tx.onchainOperation.update({
      where: { id: operationId },
      data: { expected: expected as Prisma.InputJsonValue },
    });
  }

  // Returns the naira value reserved against standing caps (0 for one-time).
  async check(
    tx: Tx,
    userId: string,
    authorizationId: string,
    usage: AuthorizationUsage,
  ): Promise<bigint> {
    await this.assertActive(tx, userId, authorizationId);
    const auth = await tx.investmentAuthorization.findUniqueOrThrow({
      where: { id: authorizationId },
    });
    await lockRows(tx, "investment_authorizations", [auth.id]);

    if (auth.kind === "one_time") {
      // All limits resolve from the owned persisted quote the consent is bound to.
      const q = usage.quote;
      if (q?.kind !== auth.quoteKind || q.id !== auth.quoteId) {
        throw new UnprocessableEntityException(
          "One-time authorization is bound to a different quote",
          "AUTHORIZATION_EXCEEDED",
        );
      }
      return 0n;
    }

    // Standing: action membership and explicit non-wildcard scope.
    if (!usage.action || !auth.actions.includes(usage.action)) {
      throw new UnprocessableEntityException(
        "Authorization does not cover this action",
        "AUTHORIZATION_EXCEEDED",
      );
    }
    // Order consents carry a per-share price limit: a fill beyond it (above for
    // buys, below for sells) is never authorized.
    if (
      (usage.action === "order_buy" || usage.action === "order_sell") &&
      auth.limitPriceMicroUsd !== null
    ) {
      const effective = usage.quote?.effectivePriceMicroUsd;
      if (effective === undefined) {
        throw new UnprocessableEntityException(
          "Order consent requires an effective fill price",
          "AUTHORIZATION_EXCEEDED",
        );
      }
      if (
        (usage.action === "order_buy" && effective > auth.limitPriceMicroUsd) ||
        (usage.action === "order_sell" && effective < auth.limitPriceMicroUsd)
      ) {
        throw new ConflictException(
          "Fill price is beyond the authorized limit",
          "AUTHORIZATION_EXCEEDED",
        );
      }
    }
    const q = usage.quote;
    if (q?.stockId && !auth.stockIds.includes(q.stockId)) {
      throw new UnprocessableEntityException(
        "Authorization is scoped to different stocks",
        "AUTHORIZATION_EXCEEDED",
      );
    }
    if (q?.strategyId && !auth.strategyIds.includes(q.strategyId)) {
      throw new UnprocessableEntityException(
        "Authorization is scoped to a different strategy",
        "AUTHORIZATION_EXCEEDED",
      );
    }

    // Value basis from the accepted quote's own FX/valuation; missing valuation is
    // rejected rather than assumed.
    let ngnKobo = q?.budgetNgnKobo ?? 0n;
    if (ngnKobo === 0n && q && q.valueMicroUsd > 0n) {
      let rate: Awaited<ReturnType<typeof ratesService.display>>["payoutRate"];
      try {
        const acceptedQuote = q.kind === "investment"
          ? await tx.investmentQuote.findUnique({ where: { id: q.id } })
          : await tx.strategyQuote.findUnique({ where: { id: q.id } });
        const fx = (acceptedQuote?.context as { fxRate?: { kobo: string; microUsd: string } } | null)?.fxRate;
        if (acceptedQuote && !fx) throw new Error("Accepted quote has no FX basis");
        rate = fx ? { kobo: BigInt(fx.kobo), microUsd: BigInt(fx.microUsd) } : (await ratesService.display()).payoutRate;
      } catch {
        throw new UnprocessableEntityException("Missing valuation basis for this action", "VALIDATION_FAILED");
      }
      ngnKobo = usdToNgn(q.valueMicroUsd, rate, "ceil");
    }
    if (q && q.valueMicroUsd > 0n && ngnKobo === 0n) {
      throw new UnprocessableEntityException("Missing valuation basis for this action", "VALIDATION_FAILED");
    }
    const actionCap = auth.maxActionNgn ? fromDbRaw(auth.maxActionNgn) : 0n;
    if (actionCap > 0n && ngnKobo > actionCap) {
      throw new ConflictException("Authorization per-action cap exceeded", "AUTHORIZATION_EXCEEDED");
    }
    // Cumulative value against the total cap, reserved atomically under the row lock.
    const ops = await tx.onchainOperation.findMany({
      where: { authorizationId: auth.id, status: { in: [...ACTIVE_OP_STATUSES] } },
      select: { expected: true },
    });
    let spent = 0n;
    for (const op of ops) {
      const usageNgn = (op.expected as { usageNgnKobo?: string } | null)?.usageNgnKobo;
      if (usageNgn) spent += BigInt(usageNgn);
    }
    const totalCap = auth.maxTotalNgn ? fromDbRaw(auth.maxTotalNgn) : 0n;
    if (totalCap > 0n && spent + ngnKobo > totalCap) {
      throw new ConflictException("Authorization total cap exceeded", "AUTHORIZATION_EXCEEDED");
    }
    if (q?.feeMicroUsd !== undefined && q.valueMicroUsd > 0n && auth.maxFeeBps !== null) {
      if (q.feeMicroUsd * 10_000n > q.valueMicroUsd * BigInt(auth.maxFeeBps)) {
        throw new UnprocessableEntityException("Fee exceeds the authorized ceiling", "AUTHORIZATION_EXCEEDED");
      }
    }
    if (q?.slippageBps !== undefined && auth.maxSlippageBps !== null && q.slippageBps > auth.maxSlippageBps) {
      throw new UnprocessableEntityException("Slippage exceeds the authorized ceiling", "AUTHORIZATION_EXCEEDED");
    }
    return ngnKobo;
  }

  // Single-use standing consent for one customer order: a price limit, fee and
  // slippage caps, expiring with the order. Idempotent under the order's key.
  async createOrderConsent(
    tx: Tx,
    userId: string,
    input: {
      orderId: string;
      side: "buy" | "sell";
      stockId: string;
      maxNgnKobo: bigint;
      limitPriceMicroUsd: bigint;
      expiresAt: Date;
    },
  ): Promise<InvestmentAuthorization> {
    const key = `auth:${userId}:order:${input.orderId}`;
    const requestHash = sha256Hex(
      canonicalJson({
        orderId: input.orderId,
        side: input.side,
        stockId: input.stockId,
        maxNgnKobo: input.maxNgnKobo.toString(),
        limitPriceMicroUsd: input.limitPriceMicroUsd.toString(),
        expiresAt: input.expiresAt.toISOString(),
      }),
    );
    const existing = await tx.investmentAuthorization.findUnique({ where: { key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          "Idempotency key reused with a different body",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return existing;
    }
    return tx.investmentAuthorization.create({
      data: {
        userId,
        key,
        kind: "standing",
        stockIds: [input.stockId],
        strategyIds: [],
        actions: [input.side === "buy" ? "order_buy" : "order_sell"],
        maxActionNgn: toDbRaw(input.maxNgnKobo),
        maxTotalNgn: toDbRaw(input.maxNgnKobo),
        maxFeeBps: 100,
        maxSlippageBps: 100,
        limitPriceMicroUsd: input.limitPriceMicroUsd,
        expiresAt: input.expiresAt,
        policyVersion: policy.app.policyVersion,
        disclosureVersion: null,
        requestHash,
      },
    });
  }

  // Finds an active standing authorization covering an action for a stock/strategy,
  // used by background flows (harvest claims, conversions, reinvest).
  async findStanding(
    userId: string,
    action: StandingAction,
    scope: { stockId?: string | null; strategyId?: string | null },
  ): Promise<AuthorizationDto | null> {
    const rows = await db.investmentAuthorization.findMany({
      where: { userId, kind: "standing", revokedAt: null, expiresAt: { gt: now() } },
    });
    for (const row of rows) {
      if (!row.actions.includes(action)) continue;
      if (scope.stockId && row.stockIds.includes(scope.stockId)) return authorizationToDto(row);
      if (scope.strategyId && row.strategyIds.includes(scope.strategyId)) return authorizationToDto(row);
    }
    return null;
  }
}

export const authorizationService = new AuthorizationService();
