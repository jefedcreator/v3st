import { controlsService } from "@/backend/services/controls";
import { type Address, type Hex, parseEventLogs } from "viem";

import {
  type OnchainOperation,
  type Prisma,
  type Strategy,
  type StrategyPosition,
  type StrategyPositionState,
} from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { authorizationService, type StandingAction } from "@/backend/services/authorizations";
import { eventService } from "@/backend/services/events";
import {
  accountAddressFor,
  executionService,
  pack,
  registerOperationFinalizer,
  unpack,
} from "@/backend/services/execution";
import { transactionDeltas, receivedOf as deltaReceivedOf, spentOf as deltaSpentOf } from "@/backend/services/execution/receipts";
import { jobService } from "@/backend/services/jobs";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import {
  cashReleased,
  cashReserved,
  stockReleased,
  stockReserved,
  strategyEntered,
  strategyExited,
  tradeFilled,
} from "@/backend/services/ledger/postings";
import { hydrexPoolAbi } from "@/backend/services/onchain/abis";
import { contextOn, publicClientOn } from "@/backend/services/onchain/chains";
import { manifestFor } from "@/backend/services/onchain/manifests";
import { assetKey } from "@/backend/services/onchain/types";
import { parseHydrexFill } from "@/backend/services/onchain/providers/hydrex/events";
import { HYDREX_ACTUAL_VERSION } from "@/backend/services/onchain/providers/hydrex/actual";
import { executionAccounts } from "@/backend/services/wallets/execution-accounts";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import "@/backend/services/onchain/providers";
import { onchainExpiryMs, publicClientFor, readManifest, settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type {
  AssetAmount,
  AssetDelta,
  BetaContext,
  ExecutionObservation,
  ExecutionQuote,
  StockProviderId,
  StrategyPlan,
  StrategyQuote,
  StrategyRequest,
} from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { positionService } from "@/backend/services/positions";
import { rewardService } from "@/backend/services/rewards";
import { stockService } from "@/backend/services/stocks";
import { stockActionService } from "@/backend/services/stocks/corporate-actions";
import { referenceUsable } from "@/backend/services/stocks/reference";
import { ratesService } from "@/backend/services/rates";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

const CHAIN = policy.onchain.networkNamespace;
const ACTIVE_OR_PENDING = ["reserved", "executing", "active", "exit_pending"] as const;
function isExitable(state: string): boolean {
  return state === "active" || state === "needs_review";
}

export type StrategyDto = {
  id: string;
  key: string;
  name: string;
  provider_id: string;
  version: string;
  disclosure_version: string;
  input_assets: string[];
  receipt_asset: string;
  reward_assets: string[];
  separate_claim: boolean;
  permanent_lock: boolean;
  cap_bps: number;
  max_usd_equivalent: string;
  enabled: boolean;
  experimental: boolean;
  provenance: unknown;
};

export type StrategyQuoteInput =
  | { strategyId: string; action: "enter"; inputs: AssetAmount[] }
  | { strategyId: string; action: "enter"; budgetInputRaw: bigint }
  | { strategyId: string; action: "claim" }
  | { positionId: string; action: "exit" | "claim" };

export type StrategyQuoteDto = {
  id: string;
  strategy_id: string;
  position_id: string | null;
  action: string;
  maximum_inputs: { asset: string; raw: string }[];
  minimum_outputs: { asset: string; raw: string }[];
  user_fee_usdc: string;
  expires_at: string;
  strategy_version: string;
  disclosure_version: string;
  fingerprint: string;
  preparatory_swap: boolean;
  created_at: string;
};

export type StrategyOperationDto = {
  operation_id: string;
  key: string;
  strategy_id: string;
  position_id: string | null;
  action: string;
  status: string;
  error_reason: string | null;
  created_at: string;
};

export type StrategyPositionDto = {
  id: string;
  strategy_id: string;
  state: string;
  receipt_raw: string;
  principal_usdc: string;
  value_usdc: string | null;
  operation_id: string | null;
  created_at: string;
  updated_at: string;
};

function amountToJson(a: AssetAmount): { asset: string; raw: string } {
  return { asset: a.asset, raw: a.raw.toString() };
}

function strategyToDto(s: Strategy): StrategyDto {
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    provider_id: s.providerId,
    version: s.version,
    disclosure_version: s.disclosureVersion,
    input_assets: (s.inputAssets as string[]) ?? [],
    receipt_asset: s.receiptAsset,
    reward_assets: (s.rewardAssets as string[]) ?? [],
    separate_claim: s.separateClaim,
    permanent_lock: s.permanentLock,
    cap_bps: s.capBps,
    max_usd_equivalent: fromDbRaw(s.maxUsdEquivalent).toString(),
    enabled: s.enabled,
    experimental: s.experimental,
    provenance: s.provenance,
  };
}

function positionToDto(p: StrategyPosition): StrategyPositionDto {
  return {
    id: p.id,
    strategy_id: p.strategyId,
    state: p.state,
    receipt_raw: fromDbRaw(p.receiptRaw).toString(),
    principal_usdc: fromDbRaw(p.principalUsdc).toString(),
    value_usdc: p.valueUsdc === null ? null : fromDbRaw(p.valueUsdc).toString(),
    operation_id: p.operationId,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

function isSettlementAsset(asset: string): boolean {
  try {
    return parseAssetKey(asset).address === parseAssetKey(settlementAssetKey(readManifest())).address;
  } catch {
    return false;
  }
}

type StoredQuoteContext = {
  betaContext: BetaContext;
  strategyQuote: unknown;
  preparatory?: unknown;
  fxRate?: { kobo: string; microUsd: string } | null;
};

type ValuationBasis = Record<string, {
  priceMicroUsd: string;
  multiplierWad: string;
  decimals: number;
  basis: string;
  asOf: string;
}>;

function valueAtBasis(amount: AssetAmount, basis: ValuationBasis): bigint | null {
  if (amount.raw === 0n) return 0n;
  if (isSettlementAsset(amount.asset)) return amount.raw;
  const ref = basis[amount.asset];
  if (!ref) return null;
  const multiplier = ref.basis === "share_price" ? BigInt(ref.multiplierWad) : 10n ** 18n;
  return amount.raw * BigInt(ref.priceMicroUsd) * multiplier / (10n ** BigInt(ref.decimals) * 10n ** 18n);
}

class StrategyService {
  async list(_userId: string): Promise<StrategyDto[]> {
    const rows = await db.strategy.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
    return rows.map(strategyToDto);
  }

  async get(_userId: string, id: string): Promise<StrategyDto> {
    const row = await db.strategy.findUnique({ where: { id } });
    if (!row?.enabled) throw new NotFoundException("Strategy not found", "NOT_FOUND");
    return strategyToDto(row);
  }

  async positions(userId: string): Promise<StrategyPositionDto[]> {
    const rows = await db.strategyPosition.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map(positionToDto);
  }

  private async quoteToDto(row: {
    id: string;
    strategyId: string;
    positionId: string | null;
    action: string;
    maximumInputs: Prisma.JsonValue;
    minimumOutputs: Prisma.JsonValue;
    userFeeUsdc: Prisma.Decimal;
    expiresAt: Date;
    strategyVersion: string;
    disclosureVersion: string;
    fingerprint: string;
    context: Prisma.JsonValue;
    createdAt: Date;
  }): Promise<StrategyQuoteDto> {
    const maximumInputs = (unpack(row.maximumInputs) as AssetAmount[]).map(amountToJson);
    const minimumOutputs = (unpack(row.minimumOutputs) as AssetAmount[]).map(amountToJson);
    const preparatory = (row.context as StoredQuoteContext | null)?.preparatory != null;
    return {
      id: row.id,
      strategy_id: row.strategyId,
      position_id: row.positionId,
      action: row.action,
      maximum_inputs: maximumInputs,
      minimum_outputs: minimumOutputs,
      user_fee_usdc: fromDbRaw(row.userFeeUsdc).toString(),
      expires_at: row.expiresAt.toISOString(),
      strategy_version: row.strategyVersion,
      disclosure_version: row.disclosureVersion,
      fingerprint: row.fingerprint,
      preparatory_swap: preparatory,
      created_at: row.createdAt.toISOString(),
    };
  }

  private async operationDto(tx: Tx, op: OnchainOperation): Promise<StrategyOperationDto> {
    const quoteRow = op.quoteId ? await tx.strategyQuote.findUnique({ where: { id: op.quoteId } }) : null;
    const position = quoteRow?.positionId
      ? await tx.strategyPosition.findUnique({ where: { id: quoteRow.positionId } })
      : await tx.strategyPosition.findFirst({ where: { operationId: op.id } });
    return {
      operation_id: op.id,
      key: op.key,
      strategy_id: quoteRow?.strategyId ?? "",
      position_id: position?.id ?? quoteRow?.positionId ?? null,
      action: quoteRow?.action ?? "",
      status: op.status,
      error_reason: op.errorReason,
      created_at: op.createdAt.toISOString(),
    };
  }

  async getOperation(userId: string, operationId: string): Promise<StrategyOperationDto | undefined> {
    const op = await db.onchainOperation.findUnique({ where: { id: operationId } });
    if (op?.userId !== userId || op?.kind !== "strategy") return undefined;
    return withTx((tx) => this.operationDto(tx, op));
  }

  // Retain the valuation evidence used when authorizing an allocation. Later
  // settlement uses this snapshot, even after the live reference changes/expires.
  private async valuationBasis(tx: Tx, assets: string[]): Promise<ValuationBasis> {
    const basis: ValuationBasis = {};
    for (const asset of new Set(assets)) {
      if (isSettlementAsset(asset)) continue;
      const stock = await tx.stock.findFirst({ where: { assetKey: asset } });
      if (!stock || !referenceUsable(stock, now()) || stock.referencePriceMicroUsd === null || !["share_price", "token_nav"].includes(stock.referenceBasis ?? "")) continue;
      basis[asset] = { priceMicroUsd: stock.referencePriceMicroUsd.toString(), multiplierWad: (await stockActionService.effectiveMultiplier(stock.id, now())).toString(), decimals: stock.decimals, basis: stock.referenceBasis!, asOf: stock.referenceAsOf!.toISOString() };
    }
    return basis;
  }

  private async usdcEquivalentOf(tx: Tx, amounts: AssetAmount[], retained?: ValuationBasis): Promise<bigint> {
    const basis = retained ?? await this.valuationBasis(tx, amounts.map((a) => a.asset));
    let total = 0n;
    for (const a of amounts) {
      const value = valueAtBasis(a, basis);
      if (value === null) {
        throw new UnprocessableEntityException("Reference price is missing or stale", "STOCK_UNAVAILABLE");
      }
      total += value;
    }
    return total;
  }

  // Available investment value backing the exposure cap: cash plus owned stock
  // value. Strategy principal is not added again (it was paid out of these).
  private async investmentValueUsdc(tx: Tx, userId: string): Promise<bigint> {
    let total = await ledgerService.balance(acct.userCash(userId, CHAIN), tx);
    const stocks = await tx.stock.findMany();
    for (const stock of stocks) {
      const owned = await ledgerService.balance(acct.userStock(userId, stock.id), tx) + await ledgerService.balance(acct.userStockReserved(userId, stock.id), tx);
      if (owned > 0n) total += await this.usdcEquivalentOf(tx, [{ asset: stock.assetKey ?? "unavailable", raw: owned }]);
    }
    return total;
  }

  async quote(userId: string, input: StrategyQuoteInput): Promise<StrategyQuoteDto> {
    let strategyId: string;
    let action: "enter" | "claim" | "exit";
    let positionId: string | null = null;
    if ("positionId" in input) {
      const position = await db.strategyPosition.findUnique({ where: { id: input.positionId } });
      if (position?.userId !== userId) {
        throw new NotFoundException("Strategy position not found", "NOT_FOUND");
      }
      if (input.action === "exit" && !isExitable(position.state)) {
        throw new ConflictException("Position is not exitable in its current state", "INVALID_TRANSITION");
      }
      if (input.action === "claim" && !["active", "needs_review"].includes(position.state)) {
        throw new ConflictException("Position is not claimable in its current state", "INVALID_TRANSITION");
      }
      strategyId = position.strategyId;
      action = input.action;
      positionId = position.id;
    } else {
      strategyId = input.strategyId;
      action = input.action;
    }
    const strategy = await db.strategy.findUnique({ where: { id: strategyId } });
    if (!strategy) throw new NotFoundException("Strategy not found", "STRATEGY_UNAVAILABLE");
    if (!strategy.enabled) {
      throw new UnprocessableEntityException("Strategy is not available in this beta", "STRATEGY_UNAVAILABLE");
    }
    if (action === "claim" && !strategy.separateClaim) {
      // Embedded fees realize on exit only; a separate claim call is unsupported.
      throw new UnprocessableEntityException(
        "This strategy realizes fees on exit; separate claim is unsupported",
        "CAPABILITY_UNAVAILABLE",
      );
    }
    if (action === "enter" && strategy.permanentLock) {
      throw new UnprocessableEntityException(
        "Permanently locked launch fixture is not an ordinary redeemable strategy",
        "CAPABILITY_UNAVAILABLE",
      );
    }
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId_family: { userId, family: "evm" } } });
    const provChain = (strategy.provenance as { chainId?: number } | null)?.chainId ?? 31337;
    const ref =
      provChain === 31337
        ? await testnetWalletService.ensureExecutionAccount(userId)
        : await executionAccounts.ensure(userId, provChain);
    const context =
      provChain === 31337
        ? await testnetService.defaultContext(strategy.providerId as StockProviderId, strategy.version, ref.custodyProfileId)
        : await contextOn(
            provChain,
            strategy.providerId as StockProviderId,
            strategy.providerId === "hydrex" ? HYDREX_ACTUAL_VERSION : strategy.version,
            ref.custodyProfileId,
          );
    const adapter = onchainRegistry.strategy(strategy.providerId as StockProviderId, context);
    const displayRates = await ratesService.display().catch(() => null);
    const fxRate = displayRates ? { kobo: displayRates.depositRate.kobo.toString(), microUsd: displayRates.depositRate.microUsd.toString() } : null;

    let inputs: AssetAmount[] = [];
    let preparatory: ExecutionQuote | null = null;
    if (action === "enter") {
      if ("inputs" in input && input.inputs.length > 0) {
        inputs = input.inputs;
      } else if ("budgetInputRaw" in input) {
        const budget = input.budgetInputRaw;
        if (budget <= 0n) throw new UnprocessableEntityException("Enter budget must be positive", "VALIDATION_FAILED");
        const settlement =
          provChain === 31337
            ? settlementAssetKey(readManifest())
            : assetKey("basesepolia", provChain, manifestFor(provChain).contracts.TestSettlementToken!.address);
        const allowedAssets = new Set((strategy.inputAssets as string[]) ?? []);
        const stockAsset = [...allowedAssets].find((a) => a !== settlement);
        const settlementLeg = budget / 2n;
        const swapBudget = budget - settlementLeg;
        inputs = [{ asset: settlement, raw: settlementLeg }];
        if (stockAsset) {
          // The stock leg is acquired by a preparatory spot swap on the same
          // provider; the deposit itself stays a validated atomic batch.
          let spot;
          try {
            spot = onchainRegistry.spot(strategy.providerId as StockProviderId, context);
          } catch {
            throw new UnprocessableEntityException(
              "Strategy entry requires a spot route on its provider",
              "CAPABILITY_UNAVAILABLE",
            );
          }
          const stock = await db.stock.findFirstOrThrow({ where: { assetKey: stockAsset } });
          if (swapBudget <= 0n) throw new UnprocessableEntityException("Enter budget too small to split", "VALIDATION_FAILED");
          preparatory = await spot.quote({
            userId,
            walletId: wallet.id,
            stockId: stock.id,
            side: "buy",
            input: { asset: settlement, raw: swapBudget },
            outputAsset: stockAsset,
            slippageBps: policy.trading.maxSlippageBps,
            context,
          });
          inputs.push({ asset: stockAsset, raw: preparatory.expectedOutput.raw });
        }
      } else {
        throw new UnprocessableEntityException("Enter requires explicit inputs or a budget", "VALIDATION_FAILED");
      }
      const allowed = new Set((strategy.inputAssets as string[]) ?? []);
      for (const a of inputs) {
        if (!allowed.has(a.asset)) {
          throw new UnprocessableEntityException("Input asset is not eligible for this strategy", "VALIDATION_FAILED");
        }
        if (a.raw <= 0n) {
          throw new UnprocessableEntityException("Input amounts must be positive", "VALIDATION_FAILED");
        }
      }
    } else if (action === "exit") {
      const position = await db.strategyPosition.findUniqueOrThrow({ where: { id: positionId! } });
      const receiptRaw = fromDbRaw(position.receiptRaw);
      if (receiptRaw <= 0n) {
        throw new ConflictException("Position holds no receipt to exit", "INVALID_TRANSITION");
      }
      inputs = [{ asset: strategy.receiptAsset, raw: receiptRaw }];
    }

    const request: StrategyRequest = { userId, strategyId, positionId, action, inputs, context };
    const quote = await adapter.quote(request);
    const expiresAt = new Date(Math.min(quote.expiresAt.getTime(), await onchainExpiryMs(30)));
    const fingerprint =
      quote.planFingerprint ||
      sha256Hex(
        canonicalJson({
          strategyId,
          action,
          positionId,
          inputs: inputs.map((a) => [a.asset, a.raw.toString()]),
        }),
      );
    const row = await db.strategyQuote.create({
      data: {
        userId,
        strategyId,
        positionId,
        action,
        maximumInputs: pack(quote.maximumInputs) as Prisma.InputJsonValue,
        minimumOutputs: pack(quote.minimumOutputs) as Prisma.InputJsonValue,
        userFeeUsdc: toDbRaw(quote.userFeeUsdc),
        expiresAt,
        strategyVersion: quote.strategyVersion,
        disclosureVersion: quote.disclosureVersion,
        fingerprint,
        context: pack({
          betaContext: context,
          strategyQuote: quote,
          preparatory,
          fxRate,
        }) as Prisma.InputJsonValue,
      },
    });
    return this.quoteToDto(row);
  }

  async confirmRequest(userId: string, quoteId: string, authorizationId: string, clientKey: string): Promise<{ dto: StrategyOperationDto; created: boolean }> {
    const key = `strategy:${userId}:${clientKey}`;
    const existing = await db.onchainOperation.findUnique({ where: { key: `strat-op:${key}` } });
    const dto = await this.confirm(userId, quoteId, authorizationId, key);
    return { dto, created: !existing };
  }

  async confirm(
    userId: string,
    quoteId: string,
    authorizationId: string,
    key: string,
    opts?: { standingAction?: StandingAction },
  ): Promise<StrategyOperationDto> {
    const requestHash = sha256Hex(canonicalJson({ quoteId, authorizationId, key }));
    return withTx(async (tx) => {
      const opKey = `strat-op:${key}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${opKey}))`;
      const existing = await tx.onchainOperation.findUnique({ where: { key: opKey } });
      if (existing) {
        if (existing.userId !== userId) throw new NotFoundException("Strategy operation not found", "NOT_FOUND");
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key reused with a different payload", "IDEMPOTENCY_KEY_REUSED");
        }
        return this.operationDto(tx, existing);
      }
      await lockRows(tx, "strategy_quotes", [quoteId]);
      const row = await tx.strategyQuote.findUniqueOrThrow({ where: { id: quoteId } });
      if (row.userId !== userId) throw new NotFoundException("Quote not found", "NOT_FOUND");
      if (row.consumedAt) throw new ConflictException("Quote already consumed", "QUOTE_CONSUMED");
      if (row.expiresAt <= now()) throw new ConflictException("Quote expired", "QUOTE_EXPIRED");
      const strategy = await tx.strategy.findUniqueOrThrow({ where: { id: row.strategyId } });
      if (!strategy.enabled || strategy.version !== row.strategyVersion || strategy.disclosureVersion !== row.disclosureVersion) {
        throw new ConflictException("Strategy version changed since the quote", "QUOTE_CHANGED");
      }
      const stored = row.context as StoredQuoteContext | null;
      if (!stored?.strategyQuote || !stored.betaContext) {
        throw new ConflictException("Quote snapshot missing", "STALE_STATE");
      }
      const quote = unpack(stored.strategyQuote) as StrategyQuote;
      const preparatory = stored.preparatory ? (unpack(stored.preparatory) as ExecutionQuote) : null;
      const action = quote.request.action;
      if (action === "enter") await controlsService.assertOpen("trading", "TRADING_PAUSED");
      if (action === "claim" && !strategy.separateClaim) {
        throw new UnprocessableEntityException(
          "This strategy realizes fees on exit; separate claim is unsupported",
          "CAPABILITY_UNAVAILABLE",
        );
      }
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId_family: { userId, family: "evm" } } });
      await lockRows(tx, "wallets", [wallet.id]);
      const ref = await testnetWalletService.ensureExecutionAccount(userId);
      const accountAddress = ref.accountAddress;
      const network = await tx.onchainNetwork.findFirst({ where: { chainId: stored.betaContext.chainId } });
      if (!network) throw new NotFoundException("Onchain network not registered", "NETWORK_UNHEALTHY");

      const valuationBasis = await this.valuationBasis(tx, [...quote.maximumInputs, ...quote.minimumOutputs].map((a) => a.asset).concat(strategy.inputAssets as string[]));
      const allocationUsdc = action === "enter" ? await this.usdcEquivalentOf(tx, quote.maximumInputs, valuationBasis) : action === "claim" ? await this.usdcEquivalentOf(tx, quote.minimumOutputs, valuationBasis) : fromDbRaw((await tx.strategyPosition.findUniqueOrThrow({ where: { id: quote.request.positionId! } })).principalUsdc);
      const usageNgnKobo = await authorizationService.check(tx, userId, authorizationId, {
        // Strategy entry/exit require one-time consent bound to this quote; a claim
        // may instead ride a standing authorization with the claim action.
        action: opts?.standingAction,
        quote: {
          kind: "strategy",
          id: row.id,
          strategyId: strategy.id,
          valueMicroUsd: allocationUsdc,
        },
      });

      // Fixture ceiling under locks: 20%-of-investment-value exposure across active
      // and pending allocations, plus the per-allocation $100-equivalent cap.
      const pending = await tx.strategyPosition.findMany({
        where: { userId, state: { in: [...ACTIVE_OR_PENDING] as StrategyPositionState[] } },
      });
      if (pending.length > 0) await lockRows(tx, "strategy_positions", pending.map((p) => p.id));
      const exposure = pending.reduce((sum, p) => sum + fromDbRaw(p.principalUsdc), 0n);
      const investmentValue = action === "enter" ? await this.investmentValueUsdc(tx, userId) : 0n;
      const maxByExposure = (BigInt(strategy.capBps) * investmentValue) / 10_000n;
      if (action === "enter" && allocationUsdc > fromDbRaw(strategy.maxUsdEquivalent)) {
        throw new UnprocessableEntityException("Allocation exceeds the strategy fixture ceiling", "LIMIT_EXCEEDED");
      }
      if (action === "enter" && exposure + allocationUsdc > maxByExposure) {
        throw new UnprocessableEntityException("Allocation exceeds the strategy exposure cap", "LIMIT_EXCEEDED");
      }

      // Reserve all required assets before any onchain step; the ledger post throws
      // INSUFFICIENT_FUNDS under row locks, so concurrent reservations cannot both
      // spend the same stock or cash. With a preparatory swap the stock leg is not
      // owned yet: it is reserved only after the swap settles (see settlePreparatory).
      const reserved: Record<string, string> = {};
      if (action === "enter") {
        for (const a of quote.maximumInputs) {
          if (isSettlementAsset(a.asset)) {
            await ledgerService.post(
              tx,
              cashReserved({ key: `${opKey}:reserve:cash`, userId, chain: CHAIN, amount: a.raw, from: "cash" }),
            );
            reserved[a.asset] = a.raw.toString();
          } else if (!preparatory) {
            const stock = await tx.stock.findFirstOrThrow({ where: { assetKey: a.asset } });
            await ledgerService.post(
              tx,
              stockReserved({ key: `${opKey}:reserve:stock:${stock.id}`, userId, stockId: stock.id, quantity: a.raw }),
            );
            reserved[a.asset] = a.raw.toString();
          }
        }
      }

      let position: StrategyPosition | null = null;
      if (action === "enter") {
        position = await tx.strategyPosition.create({
          data: {
            userId,
            strategyId: strategy.id,
            state: "reserved",
            receiptRaw: toDbRaw(0n),
            principalUsdc: toDbRaw(allocationUsdc),
          },
        });
      } else {
        const posId = quote.request.positionId;
        if (action === "exit") {
          if (!posId) throw new ConflictException("Quote is missing its position", "STALE_STATE");
          await lockRows(tx, "strategy_positions", [posId]);
          position = await tx.strategyPosition.findUniqueOrThrow({ where: { id: posId } });
          if (position.userId !== userId) throw new NotFoundException("Position not found", "NOT_FOUND");
          if (!isExitable(position.state)) {
            throw new ConflictException("Position is not exitable in its current state", "INVALID_TRANSITION");
          }
          await tx.strategyPosition.update({ where: { id: posId }, data: { state: "exit_pending" } });
        } else if (posId) {
          position = await tx.strategyPosition.findUnique({ where: { id: posId } });
          if (position && position.userId !== userId) throw new NotFoundException("Position not found", "NOT_FOUND");
        }
      }

      let preparatoryOperationId: string | null = null;
      if (preparatory && action === "enter") {
        const prepChainId = (preparatory as ExecutionQuote).context?.chainId ?? 31337;
        const settlement =
          prepChainId === 31337
            ? settlementAssetKey(readManifest())
            : assetKey("basesepolia", prepChainId, manifestFor(prepChainId).contracts.TestSettlementToken!.address);
        const prepKey = `strat-prep:${key}`;
        const swapBudget = preparatory.input.raw;
        const prep = await tx.onchainOperation.create({
          data: {
            key: prepKey,
            requestHash,
            kind: "spot",
            userId,
            walletId: wallet.id,
            custodyProfileId: ref.custodyProfileId,
            networkId: network.id,
            providerId: strategy.providerId as StockProviderId,
            quoteId: null,
            // The preparatory swap is an internal step of the authorized strategy
            // operation, not a standalone investment: it carries no authorization.
            authorizationId: null,
            fingerprint: "pending",
            expected: pack({
              quote: preparatory,
              fxRate: stored.fxRate ?? null,
              recipient: accountAddress,
              reserved: { [settlement]: swapBudget.toString() },
            }) as Prisma.InputJsonValue,
          },
        });
        preparatoryOperationId = prep.id;
        // The swap budget is reserved under the preparatory operation's own key;
        // the pool settlement leg stays reserved under the entry operation's key.
        if (swapBudget > 0n) {
          await ledgerService.post(
            tx,
            cashReserved({ key: `${prepKey}:reserve:cash`, userId, chain: CHAIN, amount: swapBudget, from: "cash" }),
          );
        }
      }

      const op = await tx.onchainOperation.create({
        data: {
          key: opKey,
          requestHash,
          kind: "strategy",
          userId,
          walletId: wallet.id,
          custodyProfileId: ref.custodyProfileId,
          networkId: network.id,
          providerId: strategy.providerId as StockProviderId,
          quoteId: row.id,
          authorizationId,
          fingerprint: "pending",
          expected: pack({
            quote,
            valuationBasis,
            recipient: accountAddress,
            preparatoryOperationId,
            reserved,
          }) as Prisma.InputJsonValue,
        },
      });
      if (action === "enter" && position) {
        await tx.strategyPosition.update({ where: { id: position.id }, data: { operationId: op.id } });
      }
      await tx.strategyQuote.update({ where: { id: quoteId }, data: { consumedAt: now(), authorizationId } });
      if (opts?.standingAction) {
        await authorizationService.recordUsage(tx, op.id, usageNgnKobo);
      }
      await jobService.enqueue(tx, { kind: "strategy.progress", subjectId: op.id });
      return this.operationDto(tx, op);
    }, { timeoutMs: 30_000 });
  }

  // Drives the preparatory swap (if any) to finality first, then the strategy
  // operation itself; settlement happens in the kind="strategy" finalizer.
  async progress(operationId: string): Promise<void> {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (op.kind !== "strategy") return;
    if (["finalized", "reverted", "failed"].includes(op.status)) return;
    // Re-arm the worker on every non-final exit so a preparatory swap that is still
    // in flight does not stall the parent operation (enqueue dedupes on
    // kind:subjectId and keeps the earliest runAt).
    const rearm = (): Promise<void> =>
      jobService.enqueue(db, {
        kind: "strategy.progress",
        subjectId: operationId,
        runAt: new Date(now().getTime() + 2_000),
      });
    const expected = (op.expected ?? {}) as { preparatoryOperationId?: string | null };
    if (expected.preparatoryOperationId) {
      const prep = await db.onchainOperation.findUnique({ where: { id: expected.preparatoryOperationId } });
      if (!prep) throw new NotFoundException("Preparatory operation missing", "OPERATION_UNRESOLVED");
      if (!["finalized", "reverted", "failed"].includes(prep.status)) {
        await executionService.progress(prep.id);
        await rearm();
        return;
      }
      const prepNow = await db.onchainOperation.findUniqueOrThrow({ where: { id: prep.id } });
      if (prepNow.status === "finalized") {
        await this.settlePreparatory(prepNow);
      } else {
        await this.failEntry(op, "PREPARATORY_FAILED");
        return;
      }
    }
    await executionService.progress(operationId);
    // Finalized strategy ops settle atomically in the kind="strategy" finalizer.
    // Reverted ops are marked by observe() before finalize() runs, so settle them
    // here under the operation lock, exactly once.
    const after = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (after.status === "reverted") {
      await withTx(async (tx) => {
        await lockRows(tx, "onchain_operations", [after.id]);
        const current = await tx.onchainOperation.findUniqueOrThrow({ where: { id: after.id } });
        if (current.status !== "reverted") return;
        const expected = (current.expected ?? {}) as { settled?: boolean; errorReason?: string };
        if (expected.settled) return;
        expected.settled = true;
        await tx.onchainOperation.update({
          where: { id: current.id },
          data: {
            expected,
            errorReason: current.errorReason ?? "EXECUTION_REVERTED",
          },
        });
        await this.settleOperation(tx, current);
      });
    }
    const latest = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (!["finalized", "reverted", "failed"].includes(latest.status)) {
      // Keep driving until the operation (and its preparatory swap) reaches a
      // proved final state.
      await jobService.enqueue(db, {
        kind: "strategy.progress",
        subjectId: operationId,
        runAt: new Date(now().getTime() + 2_000),
      });
    }
  }

  // Settles the preparatory spot swap from actual input/output and reserves the
  // acquired stock for the pending entry, so a concurrent sale cannot spend it.
  private async settlePreparatory(prep: OnchainOperation): Promise<void> {
    await withTx(async (tx) => {
      const current = await tx.onchainOperation.findUniqueOrThrow({ where: { id: prep.id } });
      if (current.status !== "finalized") return;
      if (await tx.ledgerJournal.findUnique({ where: { key: `trade:prep:${prep.id}:filled` } })) return;
      const quote = unpack((current.expected as { quote?: unknown }).quote) as ExecutionQuote;
      const stock = await stockService.get(quote.stockId);
      const actual = unpack(current.actual) as { input?: AssetAmount; output?: AssetAmount };
      const amountIn = actual.input?.raw ?? 0n;
      const amountOut = actual.output?.raw ?? 0n;
      await positionService.applyFill(tx, prep.id);
      await ledgerService.post(
        tx,
        tradeFilled({
          id: `prep:${prep.id}`,
          userId: current.userId,
          chain: stock.chain,
          venueId: current.providerId,
          stockId: stock.id,
          side: "buy",
          amountIn,
          amountOut,
        }),
      );
      const parent = await tx.onchainOperation.findFirst({
        where: { kind: "strategy", expected: { path: ["preparatoryOperationId"], equals: prep.id } },
      });
      if (parent && amountOut > 0n && stock.assetKey) {
        await ledgerService.post(
          tx,
          stockReserved({ key: `${parent.key}:reserve:stock:${stock.id}`, userId: current.userId, stockId: stock.id, quantity: amountOut }),
        );
        const expected = (parent.expected ?? {}) as { reserved?: Record<string, string> };
        expected.reserved ??= {};
        expected.reserved[stock.assetKey] = amountOut.toString();
        await tx.onchainOperation.update({
          where: { id: parent.id },
          data: { expected },
        });
      }
    });
  }

  // Entry can no longer proceed (preparatory swap failed): release every
  // reservation and park the position for review. Nothing was received onchain.
  private async failEntry(op: OnchainOperation, reason: string): Promise<void> {
    await withTx(async (tx) => {
      const current = await tx.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
      if (["finalized", "reverted", "failed"].includes(current.status)) return;
      const expected = (current.expected ?? {}) as {
        quote?: unknown;
        preparatoryOperationId?: string | null;
        reserved?: Record<string, string>;
      };
      const quote = expected.quote ? (unpack(expected.quote) as StrategyQuote) : null;
      await this.releaseReservations(tx, current, expected.reserved ?? {});
      if (expected.preparatoryOperationId) {
        const prep = await tx.onchainOperation.findUnique({ where: { id: expected.preparatoryOperationId } });
        if (prep) {
          const prepReserved = (prep.expected as { reserved?: Record<string, string> } | null)?.reserved ?? {};
          await this.releaseReservations(tx, prep, prepReserved);
        }
      }
      const position = quote?.request.positionId
        ? await tx.strategyPosition.findUnique({ where: { id: quote.request.positionId } })
        : await tx.strategyPosition.findFirst({ where: { operationId: op.id } });
      if (position) {
        await tx.strategyPosition.update({ where: { id: position.id }, data: { state: "needs_review" } });
        await eventService.emit(tx, current.userId, "strategy.position.updated", position.id, "needs_review");
      }
      await tx.onchainOperation.update({
        where: { id: op.id },
        data: { status: "failed", errorReason: reason },
      });
      await eventService.emit(tx, current.userId, "strategy.operation.updated", current.id, "failed");
    });
  }

  private async releaseReservations(
    tx: Tx,
    op: OnchainOperation,
    reserved: Record<string, string>,
  ): Promise<void> {
    for (const [asset, raw] of Object.entries(reserved)) {
      const amount = BigInt(raw);
      if (amount <= 0n) continue;
      if (isSettlementAsset(asset)) {
        await ledgerService.post(
          tx,
          cashReleased({ key: `${op.key}:reserve:cash`, userId: op.userId, chain: CHAIN, amount, to: "cash" }),
        );
      } else {
        const stock = await tx.stock.findFirst({ where: { assetKey: asset } });
        if (stock) {
          await ledgerService.post(
            tx,
            stockReleased({ key: `${op.key}:reserve:stock:${stock.id}`, userId: op.userId, stockId: stock.id, quantity: amount }),
          );
        }
      }
    }
  }

  // Finalizer for kind="strategy": persists the position lifecycle from proved
  // onchain effects (balance deltas + reward/receipt logs), never from the quote.
  async settleOperation(tx: Tx, op: OnchainOperation, _observation?: ExecutionObservation): Promise<void> {
    const expected = (op.expected ?? {}) as {
      quote?: unknown;
      plan?: unknown;
      preBalances?: Record<string, string>;
      reserved?: Record<string, string>;
      valuationBasis?: ValuationBasis;
    };
    if (!expected.quote) return;
    const quote = unpack(expected.quote) as StrategyQuote;
    const action = quote.request.action;
    const strategy = await tx.strategy.findUnique({ where: { id: quote.request.strategyId } });
    if (!strategy) return;
    const position = quote.request.positionId
      ? await tx.strategyPosition.findUnique({ where: { id: quote.request.positionId } })
      : await tx.strategyPosition.findFirst({ where: { operationId: op.id } });
    const account = await accountAddressFor(tx, op);
    const network = await tx.onchainNetwork.findUniqueOrThrow({ where: { id: op.networkId } });
    const settlement = settlementAssetKey(readManifest());
    const prov = strategy.provenance as { pool?: string; stockId?: string } | null;
    const stock = prov?.stockId ? await tx.stock.findUnique({ where: { id: prov.stockId } }) : null;
    const stockAsset = stock?.assetKey ?? null;

    if (op.status === "finalized") {
      const plan = expected.plan ? (unpack(expected.plan) as StrategyPlan) : null;
      // A strategy operation settles from its persisted observed delta vector
      // (transaction-local, account-attributed); its single-asset actualInput /
      // actualOutput fields remain null.
      const persisted = op.actual ? (unpack(op.actual) as { deltas?: AssetDelta[] }) : null;
      let deltas: AssetDelta[] = persisted?.deltas ?? [];
      if (deltas.length === 0) {
        const assets = plan ? [...plan.maximumInputs, ...plan.minimumOutputs].map((a) => a.asset) : [];
        const uniqueAssets = [...new Set(assets)];
        const network = await tx.onchainNetwork.findUniqueOrThrow({ where: { id: op.networkId } });
        const chainId = plan?.context.chainId ?? network.chainId;
        deltas = op.txHash ? await transactionDeltas(op.txHash as Hex, uniqueAssets, account, chainId) : [];
      }
      const spentOf = (asset: string): bigint => deltaSpentOf(deltas, asset);
      const receivedOf = (asset: string): bigint => deltaReceivedOf(deltas, asset);
      const isHydrexNft = (prov as { kind?: string } | null)?.kind === "hydrex_nft";
      const hydrexFill = async (act: "enter" | "exit") => {
        if (!op.txHash || !prov || isHydrexNft !== true) return null;
        const receipt = await publicClientOn(network.chainId).getTransactionReceipt({ hash: op.txHash as Hex });
        const pm = (prov as { positionManager?: string }).positionManager;
        if (!pm) return null;
        return parseHydrexFill(act, receipt.logs, pm as Address, account);
      };
      if (action === "enter") {
        const fill = await hydrexFill("enter");
        const shares = fill && fill.kind === "enter" ? fill.liquidity : await this.poolSharesFromLogs(op.txHash as Hex | null, prov?.pool, account, "Deposited");
        const settleSpent = spentOf(settlement);
        const stockSpent = stockAsset ? spentOf(stockAsset) : 0n;
        const entered = strategyEntered({
          key: op.key,
          userId: op.userId,
          chain: CHAIN,
          venueId: op.providerId,
          stockId: stock?.id ?? null,
          settlementIn: settleSpent,
          stockIn: stockSpent,
        });
        if (entered.entries.length > 0) await ledgerService.post(tx, entered);
        const reserved = expected.reserved ?? {};
        const settleReserved = BigInt(reserved[settlement] ?? "0");
        if (settleReserved > settleSpent) {
          await ledgerService.post(
            tx,
            cashReleased({ key: `${op.key}:reserve:cash`, userId: op.userId, chain: CHAIN, amount: settleReserved - settleSpent, to: "cash" }),
          );
        }
        if (stockAsset) {
          const stockReservedAmt = BigInt(reserved[stockAsset] ?? "0");
          if (stockReservedAmt > stockSpent) {
            await ledgerService.post(
              tx,
              stockReleased({ key: `${op.key}:reserve:stock:${stock!.id}`, userId: op.userId, stockId: stock!.id, quantity: stockReservedAmt - stockSpent }),
            );
          }
        }
        if (position) {
          const stockValue = stockAsset ? valueAtBasis({ asset: stockAsset, raw: stockSpent }, expected.valuationBasis ?? {}) : 0n;
          if (stockValue === null) throw new ConflictException("Entry valuation evidence is missing", "OPERATION_UNRESOLVED");
          const principal = settleSpent + stockValue;
          const enterFill = await hydrexFill("enter");
          const positionData: Prisma.StrategyPositionUpdateInput = {
            state: "active",
            receiptRaw: toDbRaw(fromDbRaw(position.receiptRaw) + shares),
            principalUsdc: toDbRaw(principal),
            valueUsdc: toDbRaw(principal),
          };
          if (enterFill && enterFill.kind === "enter") positionData.externalTokenId = toDbRaw(enterFill.tokenId);
          await tx.strategyPosition.update({
            where: { id: position.id },
            data: positionData,
          });
          await eventService.emit(tx, op.userId, "strategy.position.updated", position.id, "active");
        }
      } else if (action === "exit") {
        const fill = await hydrexFill("exit");
        const shares = fill && fill.kind === "exit" ? fill.principal0 + fill.principal1 : await this.poolSharesFromLogs(op.txHash as Hex | null, prov?.pool, account, "Withdrawn");
        const rewards = await rewardService.amountsForOperation(op.id, tx);
        // Exit transfers contain principal plus any separately logged fees. The
        // fee receipts credit the latter once; the principal posting excludes it.
        const settleOut = receivedOf(settlement) - (rewards.get(settlement) ?? 0n);
        const stockOut = stockAsset ? receivedOf(stockAsset) - (rewards.get(stockAsset) ?? 0n) : 0n;
        if (settleOut < 0n || stockOut < 0n) throw new ConflictException("Reward exceeds proved exit transfers", "OPERATION_UNRESOLVED");
        const exited = strategyExited({
          key: op.key,
          userId: op.userId,
          chain: CHAIN,
          venueId: op.providerId,
          stockId: stock?.id ?? null,
          settlementOut: settleOut,
          stockOut,
        });
        if (exited.entries.length > 0) await ledgerService.post(tx, exited);
        if (position) {
          const remaining = fromDbRaw(position.receiptRaw);
          const stockValue = stockAsset ? valueAtBasis({ asset: stockAsset, raw: stockOut }, expected.valuationBasis ?? {}) : 0n;
          const value = stockValue === null ? null : settleOut + stockValue;
          const exitFill = await hydrexFill("exit");
          await tx.strategyPosition.update({
            where: { id: position.id },
            data: {
              state: "exited",
              receiptRaw: toDbRaw(exitFill && exitFill.kind === "exit" ? 0n : remaining > shares ? remaining - shares : 0n),
              valueUsdc: value === null ? null : toDbRaw(value),
            },
          });
          await eventService.emit(tx, op.userId, "strategy.position.updated", position.id, "exited");
        }
      }
      // Claims (and exit-realized fees) become confirmed reward receipts.
      await rewardService.recordFinalized(op.id, tx);
      await eventService.emit(tx, op.userId, "strategy.operation.updated", op.id, op.status);
      return;
    }
    if (op.status === "reverted") {
      if (action === "enter") {
        // Atomic batch reverted: nothing moved onchain. Release the entry
        // reservation; assets received by earlier steps stay as owned inventory.
        await this.releaseReservations(tx, op, expected.reserved ?? {});
        if (position) {
          await tx.strategyPosition.update({ where: { id: position.id }, data: { state: "needs_review" } });
          await eventService.emit(tx, op.userId, "strategy.position.updated", position.id, "needs_review");
        }
      } else if (action === "exit" && position) {
        // Exit can proceed later with a new explicit authorization.
        await tx.strategyPosition.update({ where: { id: position.id }, data: { state: "needs_review" } });
        await eventService.emit(tx, op.userId, "strategy.position.updated", position.id, "needs_review");
      }
      await eventService.emit(tx, op.userId, "strategy.operation.updated", op.id, op.status);
    }
  }

  private async poolSharesFromLogs(
    txHash: Hex | null,
    pool: string | undefined,
    account: Address,
    eventName: "Deposited" | "Withdrawn",
  ): Promise<bigint> {
    if (!txHash || !pool) return 0n;
    const receipt = await publicClientFor().getTransactionReceipt({ hash: txHash });
    const poolLogs = receipt.logs.filter((l) => l.address.toLowerCase() === pool.toLowerCase());
    if (poolLogs.length === 0) return 0n;
    const parsed = parseEventLogs({ abi: hydrexPoolAbi, logs: poolLogs, eventName: [eventName] });
    let shares = 0n;
    for (const p of parsed) {
      if (p.args.account?.toLowerCase() === account.toLowerCase()) shares += p.args.shares;
    }
    return shares;
  }
}

export const strategyService = new StrategyService();

// Strategy operations settle their position/receipt state inside the finalize
// transaction, atomically with the operation status transition.
registerOperationFinalizer("strategy", (op, observation, tx) =>
  strategyService.settleOperation(tx, op, observation),
);
