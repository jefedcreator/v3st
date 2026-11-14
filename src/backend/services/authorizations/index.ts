import type { Prisma } from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

export type AuthorizationScope = "investments" | "strategies" | "all";

export type AuthorizationInput = {
  scope: AuthorizationScope;
  stockId?: string | null;
  strategyId?: string | null;
  maxSpendUsdc: bigint;
  durationDays: number;
  policyVersion: string;
};

export type AuthorizationDto = {
  id: string;
  scope: AuthorizationScope;
  stock_id: string | null;
  strategy_id: string | null;
  max_spend_usdc: string;
  expires_at: string;
  revoked: boolean;
  epoch: number;
  policy_version: string;
  created_at: string;
};

export function authorizationToDto(row: {
  id: string;
  scope: string;
  stockId: string | null;
  strategyId: string | null;
  maxSpendUsdc: Prisma.Decimal;
  expiresAt: Date;
  revokedAt: Date | null;
  epoch: number;
  policyVersion: string;
  createdAt: Date;
}): AuthorizationDto {
  return {
    id: row.id,
    scope: row.scope as AuthorizationScope,
    stock_id: row.stockId,
    strategy_id: row.strategyId,
    max_spend_usdc: fromDbRaw(row.maxSpendUsdc).toString(),
    expires_at: row.expiresAt.toISOString(),
    revoked: row.revokedAt !== null,
    epoch: row.epoch,
    policy_version: row.policyVersion,
    created_at: row.createdAt.toISOString(),
  };
}

class AuthorizationService {
  async create(
    userId: string,
    input: AuthorizationInput,
    idempotencyKey: string,
  ): Promise<{ dto: AuthorizationDto; created: boolean }> {
    if (input.maxSpendUsdc <= 0n) {
      throw new UnprocessableEntityException("max_spend_usdc must be positive", "VALIDATION_FAILED");
    }
    if (input.durationDays <= 0 || input.durationDays > policy.onchain.authorizationMaxDays) {
      throw new UnprocessableEntityException(
        `duration_days must be 1..${policy.onchain.authorizationMaxDays}`,
        "VALIDATION_FAILED",
      );
    }
    if (input.scope === "investments" && !input.stockId) {
      throw new UnprocessableEntityException("investments scope requires stock_id", "VALIDATION_FAILED");
    }
    if (input.scope === "strategies" && !input.strategyId) {
      throw new UnprocessableEntityException("strategies scope requires strategy_id", "VALIDATION_FAILED");
    }
    const key = `auth:${userId}:${idempotencyKey}`;
    const requestHash = sha256Hex(canonicalJson({ ...input, maxSpendUsdc: input.maxSpendUsdc.toString() }));
    const existing = await db.investmentAuthorization.findUnique({ where: { key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException("Idempotency key reused with a different body", "IDEMPOTENCY_KEY_REUSED");
      }
      return { dto: authorizationToDto(existing), created: false };
    }
    const expiresAt = new Date(now().getTime() + input.durationDays * 86_400_000);
    const row = await db.investmentAuthorization.create({
      data: {
        userId,
        key,
        scope: input.scope,
        stockId: input.stockId ?? null,
        strategyId: input.strategyId ?? null,
        maxSpendUsdc: toDbRaw(input.maxSpendUsdc),
        expiresAt,
        policyVersion: input.policyVersion,
        requestHash,
      },
    });
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
    if (!row || row.userId !== userId) {
      throw new NotFoundException("Authorization not found", "NOT_FOUND");
    }
    return authorizationToDto(row);
  }

  async revoke(userId: string, id: string): Promise<AuthorizationDto> {
    return withTx(async (tx) => {
      const row = await tx.investmentAuthorization.findUnique({ where: { id } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException("Authorization not found", "NOT_FOUND");
      }
      if (row.revokedAt) return authorizationToDto(row);
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

  async check(
    tx: Tx,
    userId: string,
    authorizationId: string,
    usage: { scope: AuthorizationScope; stockId?: string | null; strategyId?: string | null; amountUsdc: bigint },
  ): Promise<void> {
    const auth = await tx.investmentAuthorization.findUnique({ where: { id: authorizationId } });
    if (!auth || auth.userId !== userId) {
      throw new NotFoundException("Authorization not found", "NOT_FOUND");
    }
    if (auth.revokedAt) {
      throw new ConflictException("Authorization revoked", "AUTHORIZATION_REVOKED");
    }
    if (auth.expiresAt <= now()) {
      throw new ConflictException("Authorization expired", "AUTHORIZATION_EXPIRED");
    }
    const scopeOk =
      auth.scope === "all" ||
      (auth.scope === "investments" && usage.scope === "investments") ||
      (auth.scope === "strategies" && usage.scope === "strategies");
    if (!scopeOk) {
      throw new UnprocessableEntityException("Authorization scope does not cover this action", "AUTHORIZATION_EXCEEDED");
    }
    if (auth.stockId && usage.stockId && auth.stockId !== usage.stockId) {
      throw new UnprocessableEntityException("Authorization is scoped to a different stock", "AUTHORIZATION_EXCEEDED");
    }
    if (auth.strategyId && usage.strategyId && auth.strategyId !== usage.strategyId) {
      throw new UnprocessableEntityException("Authorization is scoped to a different strategy", "AUTHORIZATION_EXCEEDED");
    }
    await lockRows(tx, "investment_authorizations", [auth.id]);
    const spent = await tx.investment.aggregate({
      where: { authorizationId: auth.id, status: { in: ["reserved", "executing", "filled", "partial"] } },
      _sum: { amountIn: true },
    });
    const spentUsdc = spent._sum.amountIn ? fromDbRaw(spent._sum.amountIn) : 0n;
    if (spentUsdc + usage.amountUsdc > fromDbRaw(auth.maxSpendUsdc)) {
      throw new ConflictException("Authorization spend limit exceeded", "AUTHORIZATION_EXCEEDED");
    }
  }
}

export const authorizationService = new AuthorizationService();
