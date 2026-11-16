import { type Address } from "viem";

import { type Investment, type InvestmentQuote, type TradePurpose, type TradeSide, type Prisma } from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { authorizationService, type StandingAction } from "@/backend/services/authorizations";
import { controlsService } from "@/backend/services/controls";
import { eventService } from "@/backend/services/events";
import { executionService, pack, unpack } from "@/backend/services/execution";
import { jobService } from "@/backend/services/jobs";
import { ledgerService } from "@/backend/services/ledger";
import { cashReleased, cashReserved, stockReleased, stockReserved, tradeFilled } from "@/backend/services/ledger/postings";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import { positionService } from "@/backend/services/positions";
import { settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type { AssetAmount, BetaContext, ExecutionQuote, StockProviderId } from "@/backend/services/onchain/types";
import { referenceUsable } from "@/backend/services/stocks/reference";
import { stockService } from "@/backend/services/stocks";
import { ratesService } from "@/backend/services/rates";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, fromDbRawNullable, toDbRaw } from "@/utils/asset-units";
import { ngnToUsd } from "@/utils/money";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from "@/utils/exceptions";

export type InvestmentQuoteInput = {
  stockId: string;
  side: "buy" | "sell";
  inputRaw?: bigint;
  budgetNgn?: bigint;
  slippageBps?: number;
  allowPartialFill?: boolean;
};

export type InvestmentQuoteDto = {
  id: string;
  stock_id: string;
  side: "buy" | "sell";
  input_asset: string;
  input_raw: string;
  output_asset: string;
  expected_output_raw: string;
  min_output_raw: string;
  fee_usdc_raw: string;
  fx_fee_usdc_raw: string;
  venue_fee_usdc_raw: string;
  price_impact_bps: number;
  allow_partial_fill: boolean;
  provider_id: string;
  venue_fee_asset: string | null;
  venue_fee_raw: string | null;
  beta_context: BetaContext;
  fx_rate: { kobo: string; micro_usd: string; as_of: string; expires_at: string } | null;
  expires_at: string;
  created_at: string;
};

export type InvestmentDto = {
  id: string;
  key: string;
  stock_id: string;
  side: string;
  purpose: string;
  status: string;
  amount_in: string;
  amount_out: string | null;
  min_amount_out: string | null;
  provider_id: string | null;
  operation_id: string | null;
  failure_reason: string | null;
  created_at: string;
};

function quoteToDto(q: InvestmentQuote, providerId: string): InvestmentQuoteDto {
  const fx = (q.context as { fxRate?: { kobo: string; microUsd: string; asOf: string; expiresAt: string } }).fxRate;
  return {
    id: q.id,
    stock_id: q.stockId,
    side: q.side,
    input_asset: q.inputAsset,
    input_raw: fromDbRaw(q.inputRaw).toString(),
    output_asset: q.outputAsset,
    expected_output_raw: fromDbRaw(q.expectedOutputRaw).toString(),
    min_output_raw: fromDbRaw(q.minOutputRaw).toString(),
    fee_usdc_raw: fromDbRaw(q.feeUsdc).toString(),
    fx_fee_usdc_raw: fromDbRaw(q.fxFeeUsdc).toString(),
    venue_fee_usdc_raw: fromDbRaw(q.venueFeeUsdc).toString(),
    price_impact_bps: q.priceImpactBps,
    allow_partial_fill: q.allowPartialFill,
    provider_id: providerId,
    venue_fee_asset: q.venueFeeAsset,
    venue_fee_raw: q.venueFeeRaw === null ? null : fromDbRaw(q.venueFeeRaw).toString(),
    beta_context: (q.context as { betaContext: BetaContext }).betaContext,
    fx_rate: fx ? { kobo: fx.kobo, micro_usd: fx.microUsd, as_of: fx.asOf, expires_at: fx.expiresAt } : null,
    expires_at: q.expiresAt.toISOString(),
    created_at: q.createdAt.toISOString(),
  };
}

export function investmentToDto(i: Investment, providerId: string | null): InvestmentDto {
  return {
    id: i.id,
    key: i.key,
    stock_id: i.stockId,
    side: i.side,
    purpose: i.purpose,
    status: i.status,
    amount_in: fromDbRaw(i.amountIn).toString(),
    amount_out: fromDbRawNullable(i.amountOut)?.toString() ?? null,
    min_amount_out: fromDbRawNullable(i.minAmountOut)?.toString() ?? null,
    provider_id: providerId,
    operation_id: i.operationId,
    failure_reason: i.failureReason,
    created_at: i.createdAt.toISOString(),
  };
}

const QUOTE_TIMEOUT_MS = 3_000;
// Spot-capable beta providers, in deterministic tie-break order.
const SPOT_PROVIDERS: StockProviderId[] = ["hydrex", "o1"];

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`quote timeout: ${label}`)), ms)),
  ]);
}

async function custodyProfileFor(tx: Tx, userId: string, providerId: StockProviderId): Promise<{ id: string; address: Address }> {
  const wallet = await tx.wallet.findUnique({ where: { userId_family: { userId, family: "evm" } } });
  if (!wallet) throw new NotFoundException("Wallet not provisioned", "WALLET_NOT_READY");
  if (providerId === "bankr") {
    const profile = await tx.custodyProfile.findUnique({
      where: { kind_walletId: { kind: "provider_managed", walletId: wallet.id } },
    });
    if (profile?.managedAddress) return { id: profile.id, address: profile.managedAddress as Address };
    throw new UnprocessableEntityException("Bankr route requires a provisioned managed profile", "CAPABILITY_UNAVAILABLE");
  }
  const ref = await testnetWalletService.ensureExecutionAccount(userId);
  return { id: ref.custodyProfileId, address: ref.accountAddress };
}

class InvestmentService {
  async quote(userId: string, input: InvestmentQuoteInput): Promise<InvestmentQuoteDto> {
    await controlsService.assertOpen("trading", "TRADING_PAUSED");
    let inputRaw = input.inputRaw;
    let fxRate: { kobo: string; microUsd: string; asOf: string; expiresAt: string } | null = null;
    try {
      const display = await ratesService.display();
      const rate = input.side === "buy" ? display.depositRate : display.payoutRate;
      fxRate = { kobo: rate.kobo.toString(), microUsd: rate.microUsd.toString(), asOf: display.asOf.toISOString(), expiresAt: display.expiresAt.toISOString() };
      if (input.budgetNgn !== undefined) {
        if (input.side !== "buy" || input.budgetNgn <= 0n) throw new UnprocessableEntityException("Only buys accept a positive naira budget", "VALIDATION_FAILED");
        inputRaw = ngnToUsd(input.budgetNgn, rate, "floor");
      }
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      if (input.budgetNgn !== undefined) throw new ServiceUnavailableException("Rates unavailable", "RATES_UNAVAILABLE");
    }
    if (inputRaw === undefined || inputRaw <= 0n) throw new UnprocessableEntityException("Input must be positive", "VALIDATION_FAILED");
    const acceptedInputRaw = inputRaw;
    if ((input.slippageBps ?? policy.trading.maxSlippageBps) > 100) throw new UnprocessableEntityException("Slippage exceeds beta limit", "VALIDATION_FAILED");
    const stock = await stockService.get(input.stockId);
    if (!stock.assetKey || !stock.networkId) {
      throw new UnprocessableEntityException("Stock has no onchain route in this beta", "STOCK_UNAVAILABLE");
    }
    if (!stock.enabled || stock.paused || stock.delisted) {
      throw new UnprocessableEntityException("Stock is not tradable", "CAPABILITY_UNAVAILABLE");
    }
    if (!referenceUsable(stock, now())) {
      throw new UnprocessableEntityException("Reference price is missing or stale", "STOCK_UNAVAILABLE");
    }
    const network = await db.onchainNetwork.findUniqueOrThrow({ where: { id: stock.networkId } });
    const chainId = network.chainId;
    const { readManifest, settlementAssetKey } = await import("@/backend/services/onchain/testnet");
    const { manifestFor } = await import("@/backend/services/onchain/manifests");
    const { contextOn } = await import("@/backend/services/onchain/chains");
    const { executionAccounts } = await import("@/backend/services/wallets/execution-accounts");
    const { HYDREX_ACTUAL_VERSION } = await import("@/backend/services/onchain/providers/hydrex/actual");
    const { assetKey } = await import("@/backend/services/onchain/types");
    const settlement =
      chainId === 31337
        ? settlementAssetKey(readManifest())
        : assetKey("basesepolia", chainId, manifestFor(chainId).contracts.TestSettlementToken!.address);
    const slippageBps = input.slippageBps ?? policy.trading.maxSlippageBps;

    // Chain 31337 keeps the local candidate loop; on Base Sepolia the only route is
    // the verified Hydrex provider.
    const providerIds: StockProviderId[] = chainId === 31337 ? SPOT_PROVIDERS : ["hydrex"];
    const candidates = await Promise.all(
      providerIds.map(async (providerId) => {
        try {
          let profile: { id: string; address: Address };
          let context;
          if (chainId === 31337) {
            profile = await custodyProfileFor(db, userId, providerId);
            context = await testnetService.defaultContext(providerId, "replica-1.0.0", profile.id);
          } else {
            const ref = await executionAccounts.ensure(userId, chainId);
            profile = { id: ref.custodyProfileId, address: ref.accountAddress };
            context = await contextOn(chainId, providerId, HYDREX_ACTUAL_VERSION, profile.id);
          }
          const adapter = onchainRegistry.spot(providerId, context);
          const side = input.side;
          const quote = await withTimeout(
            adapter.quote({
              userId,
              walletId: (await db.wallet.findUniqueOrThrow({ where: { userId_family: { userId, family: "evm" } } })).id,
              stockId: input.stockId,
              side,
              input: {
                asset: side === "buy" ? settlement : stock.assetKey!,
                raw: acceptedInputRaw,
              },
              outputAsset: side === "buy" ? stock.assetKey! : settlement,
              slippageBps,
              allowPartialFill: input.allowPartialFill ?? false,
              context,
            }),
            QUOTE_TIMEOUT_MS,
            providerId,
          );
          return { providerId, context, quote };
        } catch {
          // A timed-out or unavailable provider never hides healthy alternatives,
          // and unknown providers are never a fallback.
          return null;
        }
      }),
    );

    const viable = candidates.filter(
      (c): c is NonNullable<typeof c> =>
        c !== null &&
        c.quote.expiresAt > now() &&
        c.quote.priceImpactBps <= policy.onchain.maxPriceImpactBps &&
        c.quote.context.chainId === network.chainId,
    );
    if (viable.length === 0) {
      throw new ConflictException("No provider can quote this route within impact limits", "NO_ROUTE");
    }
    // Highest net output at the same input and disclosed fee basis; deterministic
    // provider-ID tie break.
    viable.sort((a, b) => {
      const netA = a.quote.expectedOutput.raw;
      const netB = b.quote.expectedOutput.raw;
      if (netA !== netB) return netA > netB ? -1 : 1;
      return a.providerId < b.providerId ? -1 : 1;
    });
    const best = viable[0]!;
    const { onchainExpiryMs } = await import("@/backend/services/onchain/testnet");
    // The contract deadline is copied from this expiry and enforced onchain, so
    // the bound must hold on both the app and chain clocks.
    const expiresAt = new Date(Math.min(best.quote.expiresAt.getTime(), await onchainExpiryMs(30, chainId)));
    const row = await db.investmentQuote.create({
      data: {
        userId,
        stockId: input.stockId,
        side: input.side,
        inputAsset: best.quote.input.asset,
        inputRaw: toDbRaw(best.quote.input.raw),
        outputAsset: best.quote.expectedOutput.asset,
        expectedOutputRaw: toDbRaw(best.quote.expectedOutput.raw),
        minOutputRaw: toDbRaw(best.quote.minOutput.raw),
        budgetNgn: input.budgetNgn ?? null,
        allowPartialFill: input.allowPartialFill ?? false,
        slippageBps,
        venueFeeAsset: best.quote.venueFee?.asset ?? null,
        venueFeeRaw: best.quote.venueFee ? toDbRaw(best.quote.venueFee.raw) : null,
        feeUsdc: toDbRaw(0n),
        fxFeeUsdc: toDbRaw(0n),
        venueFeeUsdc: toDbRaw(best.quote.venueFee ? (input.side === "buy" ? best.quote.venueFee.raw : (best.quote.venueFee.raw * (stock.referencePriceMicroUsd ?? 0n)) / 10n ** BigInt(stock.decimals)) : 0n),
        priceImpactBps: best.quote.priceImpactBps,
        providerId: best.providerId,
        providerVersion: best.context.providerVersion,
        context: {
          betaContext: best.context,
          fxRate,
          executionQuote: {
            id: best.quote.id,
            userId,
            walletId: best.quote.walletId,
            stockId: input.stockId,
            side: input.side,
            context: best.context,
            input: { asset: best.quote.input.asset, raw: best.quote.input.raw.toString() },
            expectedOutput: { asset: best.quote.expectedOutput.asset, raw: best.quote.expectedOutput.raw.toString() },
            minOutput: { asset: best.quote.minOutput.asset, raw: best.quote.minOutput.raw.toString() },
            userFeeUsdc: "0",
            sponsorCostWei: "0",
            allowPartialFill: best.quote.allowPartialFill,
            priceImpactBps: best.quote.priceImpactBps,
            expiresAt: expiresAt.toISOString(),
            sourceBlock: best.quote.sourceBlock.toString(),
            routeFingerprint: best.quote.routeFingerprint,
          },
        },
        expiresAt,
        sourceBlock: toDbRaw(best.quote.sourceBlock),
        routeFingerprint: best.quote.routeFingerprint,
      },
    });
    return quoteToDto(row, best.providerId);
  }

  async confirm(
    userId: string,
    quoteId: string,
    authorizationId: string,
    key: string,
    opts?: { standingAction?: StandingAction },
  ): Promise<InvestmentDto> {
    const requestHash = sha256Hex(canonicalJson({ quoteId, authorizationId, key }));
    return withTx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const existing = await tx.investment.findUnique({ where: { key } });
      if (existing) {
        if (existing.userId !== userId) throw new NotFoundException("Investment not found", "NOT_FOUND");
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key reused with a different payload", "IDEMPOTENCY_KEY_REUSED");
        }
        const q = existing.quoteId ? await tx.investmentQuote.findUniqueOrThrow({ where: { id: existing.quoteId } }) : null;
        return investmentToDto(existing, q?.providerId ?? null);
      }
      await lockRows(tx, "investment_quotes", [quoteId]);
      const quote = await tx.investmentQuote.findUniqueOrThrow({ where: { id: quoteId } });
      if (quote.userId !== userId) throw new NotFoundException("Quote not found", "NOT_FOUND");
      if (quote.consumedAt) throw new ConflictException("Quote already consumed", "QUOTE_CONSUMED");
      const stock = await stockService.get(quote.stockId);
      if (quote.expiresAt <= now()) {
        // Expired quote: cash is left untouched and the investment needs confirmation.
        const inv = await tx.investment.create({
          data: {
            key,
            requestHash,
            userId,
            quoteId: quote.id,
            authorizationId,
            stockId: quote.stockId,
            side: quote.side,
            status: "needs_confirmation",
            holdReason: "QUOTE_EXPIRED",
            amountIn: quote.inputRaw,
          },
        });
        return investmentToDto(inv, quote.providerId);
      }
      const usageNgnKobo = await authorizationService.check(tx, userId, authorizationId, {
        action: opts?.standingAction,
        quote: {
          kind: "investment",
          id: quote.id,
          stockId: quote.stockId,
          // Value basis: buys spend settlement input; sells are valued at the
          // expected settlement output of the accepted quote.
          valueMicroUsd:
            quote.side === "buy" ? fromDbRaw(quote.inputRaw) : fromDbRaw(quote.expectedOutputRaw),
          budgetNgnKobo: quote.budgetNgn === null ? null : BigInt(quote.budgetNgn),
          slippageBps: quote.slippageBps,
          feeMicroUsd: fromDbRaw(quote.feeUsdc) + fromDbRaw(quote.fxFeeUsdc) + fromDbRaw(quote.venueFeeUsdc),
        },
      });
      const context = quote.context as {
        betaContext: BetaContext;
        executionQuote: {
          id: string;
          walletId: string;
          side: "buy" | "sell";
          allowPartialFill: boolean;
          input: { asset: string; raw: string };
          expectedOutput: { asset: string; raw: string };
          minOutput: { asset: string; raw: string };
          userFeeUsdc?: string;
          sponsorCostWei?: string;
          priceImpactBps: number;
          sourceBlock: string;
          routeFingerprint: string;
        };
      };
      const eq = context.executionQuote;
      if (!eq) throw new ConflictException("Quote snapshot missing", "STALE_STATE");
      const executionQuote: ExecutionQuote = {
        id: eq.id,
        userId,
        walletId: eq.walletId,
        stockId: quote.stockId,
        side: eq.side,
        context: context.betaContext,
        input: { asset: eq.input.asset, raw: BigInt(eq.input.raw) },
        expectedOutput: { asset: eq.expectedOutput.asset, raw: BigInt(eq.expectedOutput.raw) },
        minOutput: { asset: eq.minOutput.asset, raw: BigInt(eq.minOutput.raw) },
        userFeeUsdc: BigInt(eq.userFeeUsdc ?? "0"),
        sponsorCostWei: BigInt(eq.sponsorCostWei ?? "0"),
        allowPartialFill: eq.allowPartialFill,
        priceImpactBps: eq.priceImpactBps,
        expiresAt: quote.expiresAt,
        sourceBlock: BigInt(eq.sourceBlock),
        routeFingerprint: eq.routeFingerprint,
      };
      // Atomic reserve: the ledger post throws INSUFFICIENT_FUNDS under row locks, so
      // two concurrent reservations of the same cash cannot both succeed.
      if (quote.side === "buy") {
        await ledgerService.post(
          tx,
          cashReserved({ key, userId, chain: stock.chain, amount: fromDbRaw(quote.inputRaw), from: "cash" }),
        );
      } else {
        await ledgerService.post(
          tx,
          stockReserved({ key, userId, stockId: quote.stockId, quantity: fromDbRaw(quote.inputRaw) }),
        );
      }
      const network = await tx.onchainNetwork.findUniqueOrThrow({ where: { id: stock.networkId! } });
      const profile = await custodyProfileFor(tx, userId, quote.providerId as StockProviderId);
      const inv = await tx.investment.create({
        data: {
          key,
          requestHash,
          userId,
          quoteId: quote.id,
          authorizationId,
          stockId: quote.stockId,
          side: quote.side,
          status: "reserved",
          amountIn: quote.inputRaw,
          minAmountOut: quote.minOutputRaw,
        },
      });
      const op = await tx.onchainOperation.create({
        data: {
          key: `inv-op:${key}`,
          requestHash,
          kind: "spot",
          userId,
          walletId: executionQuote.walletId,
          custodyProfileId: profile.id,
          networkId: network.id,
          providerId: quote.providerId,
          quoteId: quote.id,
          authorizationId,
          fingerprint: "pending",
          expected: pack({ quote: executionQuote, recipient: profile.address }) as Prisma.InputJsonValue,
        },
      });
      const updated = await tx.investment.update({
        where: { id: inv.id },
        data: { operationId: op.id, status: "executing" },
      });
      await tx.investmentQuote.update({ where: { id: quoteId }, data: { consumedAt: now() } });
      if (opts?.standingAction) {
        await authorizationService.recordUsage(tx, op.id, usageNgnKobo);
      }
      await jobService.enqueue(tx, { kind: "operation.progress", subjectId: op.id });
      await jobService.enqueue(tx, { kind: "investment.progress", subjectId: inv.id });
      return investmentToDto(updated, quote.providerId);
    }, { timeoutMs: 30_000 });
  }

  async confirmRequest(userId: string, quoteId: string, authorizationId: string, clientKey: string): Promise<{ dto: InvestmentDto; created: boolean }> {
    const key = `invest:${userId}:${clientKey}`;
    const existing = await db.investment.findUnique({ where: { key } });
    if (!existing) {
      const quote = await db.investmentQuote.findUnique({ where: { id: quoteId } });
      if (quote?.userId !== userId) throw new NotFoundException("Quote not found", "NOT_FOUND");
      if (quote.expiresAt <= now()) throw new ConflictException("Quote expired", "QUOTE_EXPIRED");
    }
    const dto = await this.confirm(userId, quoteId, authorizationId, key);
    return { dto, created: !existing };
  }

  async get(userId: string, id: string): Promise<InvestmentDto | undefined> {
    const inv = await db.investment.findUnique({ where: { id } });
    if (inv?.userId !== userId) return undefined;
    const quote = inv.quoteId ? await db.investmentQuote.findUnique({ where: { id: inv.quoteId } }) : null;
    return investmentToDto(inv, quote?.providerId ?? null);
  }

  async list(userId: string): Promise<InvestmentDto[]> {
    const rows = await db.investment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return Promise.all(
      rows.map(async (r) => {
        const q = r.quoteId ? await db.investmentQuote.findUnique({ where: { id: r.quoteId } }) : null;
        return investmentToDto(r, q?.providerId ?? null);
      }),
    );
  }

  // Drives the linked onchain operation and settles the ledger from actual
  // input/output; partial fills never rerun the original size.
  async progress(id: string): Promise<void> {
    const inv = await db.investment.findUniqueOrThrow({ where: { id } });
    if (!inv.operationId) return;
    const before = inv.status;
    if (["filled", "partial", "failed", "cancelled"].includes(before)) return;
    await executionService.progress(inv.operationId);
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operationId } });
    if (!["finalized", "reverted"].includes(op.status)) {
      // Keep driving until the onchain operation reaches a proved final state.
      await jobService.enqueue(db, {
        kind: "investment.progress",
        subjectId: id,
        runAt: new Date(now().getTime() + 2_000),
      });
      return;
    }
    if (op.status === "finalized" && before !== "filled") {
      const actual = unpack(op.actual) as { input?: AssetAmount; output?: AssetAmount };
      const expectedQuote = unpack((op.expected as { quote?: unknown }).quote) as ExecutionQuote;
      const stock = await db.stock.findUniqueOrThrow({ where: { id: inv.stockId } });
      await withTx(async (tx) => {
        const current = await tx.investment.findUniqueOrThrow({ where: { id: inv.id } });
        await lockRows(tx, "investments", [inv.id]);
        if (["filled", "partial"].includes((await tx.investment.findUniqueOrThrow({ where: { id: inv.id } })).status)) return;
        const amountOut = actual.output?.raw ?? 0n;
        await positionService.applyFill(tx, op.id);
        const actualIn = actual.input?.raw ?? fromDbRaw(current.amountIn);
        await ledgerService.post(
          tx,
          tradeFilled({
            id: current.id,
            userId: current.userId,
            chain: stock.chain,
            venueId: op.providerId,
            stockId: current.stockId,
            side: current.side,
            amountIn: actualIn,
            amountOut,
          }),
        );
        // A partial input fill releases only the unused remainder of the reservation.
        const reservedIn = fromDbRaw(current.amountIn);
        if (actualIn < reservedIn) {
          if (current.side === "buy") {
            await ledgerService.post(
              tx,
              cashReleased({ key: current.key, userId: current.userId, chain: stock.chain, amount: reservedIn - actualIn, to: "cash" }),
            );
          } else {
            await ledgerService.post(
              tx,
              stockReleased({ key: current.key, userId: current.userId, stockId: current.stockId, quantity: reservedIn - actualIn }),
            );
          }
        }
        // Actual output below the quoted expectation is a partial fill; only the
        // actual input is spent and the remainder needs a fresh quote (single-use).
        const expectedOut = expectedQuote.expectedOutput.raw;
        const settledStatus = actualIn < fromDbRaw(current.amountIn) ? "partial" : "filled";
        void expectedOut;
        await tx.investment.update({
          where: { id: current.id },
          data: {
            status: settledStatus,
            amountOut: toDbRaw(amountOut),
          },
        });
        await eventService.emit(tx, current.userId, "investment.updated", current.id, settledStatus);
      });
      // A finalized reward-asset conversion sell recognizes its settlement proceeds
      // exactly once, so Friday payouts only ever pay finalized source proceeds.
      if (inv.key.startsWith("convert:")) {
        const { earningsService } = await import("@/backend/services/earnings");
        await earningsService.recognize(inv.key.slice("convert:".length));
      }
      return;
    }
    if (op.status === "reverted" && !["failed", "cancelled"].includes(before)) {
      const stock = await db.stock.findUniqueOrThrow({ where: { id: inv.stockId } });
      await withTx(async (tx) => {
        const current = await tx.investment.findUniqueOrThrow({ where: { id: inv.id } });
        if (["failed", "cancelled", "filled"].includes(current.status)) return;
        if (current.side === "buy") {
          await ledgerService.post(
            tx,
            cashReleased({ key: current.key, userId: current.userId, chain: stock.chain, amount: fromDbRaw(current.amountIn), to: "cash" }),
          );
        } else {
          await ledgerService.post(
            tx,
            stockReleased({ key: current.key, userId: current.userId, stockId: current.stockId, quantity: fromDbRaw(current.amountIn) }),
          );
        }
        await tx.investment.update({
          where: { id: current.id },
          data: { status: "failed", failureReason: op.errorReason ?? "EXECUTION_REVERTED" },
        });
        await eventService.emit(tx, current.userId, "investment.updated", current.id, "failed");
      });
    }
  }
}

export const investmentService = new InvestmentService();

// Compatibility facades for legacy createBuy/createSell callers on testnet stocks:
// the persisted investment/operation contracts drive execution, keeping the
// downstream purpose identity on the investment row (linked via trade.investmentId).
async function attachTrade(
  tx: Tx,
  trade: { id: string; key: string; userId: string; stockId: string; side: TradeSide; purpose: TradePurpose; orderId: string | null; amountIn: bigint },
): Promise<Investment> {
  const existing = await tx.investment.findUnique({ where: { key: trade.key } });
  if (existing) return existing;
  const inv = await tx.investment.create({
    data: {
      key: trade.key,
      requestHash: sha256Hex(canonicalJson({ key: trade.key, stockId: trade.stockId, side: trade.side, amountIn: trade.amountIn.toString() })),
      userId: trade.userId,
      stockId: trade.stockId,
      side: trade.side,
      purpose: trade.purpose,
      orderId: trade.orderId,
      status: "quoted",
      amountIn: toDbRaw(trade.amountIn),
    },
  });
  await tx.tradeOrder.update({ where: { id: trade.id }, data: { investmentId: inv.id } });
  return inv;
}

// Drives a testnet trade through quote/confirm/execution. The legacy stock_id path
// carries no fresh authorization, so it lands in needs_confirmation with cash left
// untouched; an explicit authorization (accepted investment intent) confirms.
async function progressTrade(tradeId: string): Promise<void> {
  const t = await db.tradeOrder.findUniqueOrThrow({ where: { id: tradeId } });
  if (t.status === "filled" || t.status === "failed") return;
  const stock = await stockService.get(t.stockId);
  if (!stock.networkId) return;
  let inv = await db.investment.findUnique({ where: { key: t.key } });
  inv ??= await withTx((tx) =>
    attachTrade(tx, {
      id: t.id,
      key: t.key,
      userId: t.userId,
      stockId: t.stockId,
      side: t.side,
      purpose: t.purpose,
      orderId: t.orderId,
      amountIn: fromDbRaw(t.amountIn),
    }),
  );
  if (!inv.quoteId) {
    const quoteDto = await investmentService.quote(t.userId, {
      stockId: t.stockId,
      side: t.side,
      inputRaw: fromDbRaw(t.amountIn),
    });
    inv = await db.investment.update({ where: { id: inv.id }, data: { quoteId: quoteDto.id } });
  }
  const quote = await db.investmentQuote.findUniqueOrThrow({ where: { id: inv.quoteId! } });
  if (!inv.operationId) {
    if (quote.expiresAt <= now()) {
      // Expired quote/consent: cash stays with the user, investment needs confirmation.
      await withTx(async (tx) => {
        await lockRows(tx, "investments", [inv.id]);
        const current = await tx.investment.findUniqueOrThrow({ where: { id: inv.id } });
        if (current.status !== "quoted") return;
        await tx.investment.update({
          where: { id: current.id },
          data: { status: "needs_confirmation", holdReason: "QUOTE_EXPIRED" },
        });
        if (t.side === "buy") {
          await ledgerService.post(
            tx,
            cashReleased({ key: t.key, userId: t.userId, chain: stock.chain, amount: fromDbRaw(t.amountIn), to: t.fundsSource === "earnings" ? "earnings" : "cash" }),
          );
        } else {
          await ledgerService.post(
            tx,
            stockReleased({ key: t.key, userId: t.userId, stockId: t.stockId, quantity: fromDbRaw(t.amountIn) }),
          );
        }
        await tx.tradeOrder.update({ where: { id: t.id }, data: { status: "failed", failureReason: "QUOTE_EXPIRED" } });
        await tx.earning.updateMany({ where: { reinvestTradeId: t.id }, data: { reinvestTradeId: null } });
        await tx.earningAllocation.updateMany({
          where: { reinvestTradeId: t.id },
          data: { state: "available", reinvestTradeId: null },
        });
        await tx.rewardReceipt.updateMany({
          where: { reinvestTradeId: t.id },
          data: { state: "available", reinvestTradeId: null },
        });
      });
      return;
    }
    // No fresh authorization on the legacy path: never an unbounded buy.
    await withTx(async (tx) => {
      await lockRows(tx, "investments", [inv.id]);
      const current = await tx.investment.findUniqueOrThrow({ where: { id: inv.id } });
      if (current.status !== "quoted") return;
      await tx.investment.update({
        where: { id: current.id },
        data: { status: "needs_confirmation", holdReason: "CONSENT_REQUIRED" },
      });
      if (t.side === "buy") {
        await ledgerService.post(
          tx,
          cashReleased({ key: t.key, userId: t.userId, chain: stock.chain, amount: fromDbRaw(t.amountIn), to: t.fundsSource === "earnings" ? "earnings" : "cash" }),
        );
      } else {
        await ledgerService.post(
          tx,
          stockReleased({ key: t.key, userId: t.userId, stockId: t.stockId, quantity: fromDbRaw(t.amountIn) }),
        );
      }
      await tx.tradeOrder.update({ where: { id: t.id }, data: { status: "failed", failureReason: "NEEDS_CONFIRMATION" } });
      await tx.earning.updateMany({ where: { reinvestTradeId: t.id }, data: { reinvestTradeId: null } });
      await tx.earningAllocation.updateMany({
        where: { reinvestTradeId: t.id },
        data: { state: "available", reinvestTradeId: null },
      });
      await tx.rewardReceipt.updateMany({
        where: { reinvestTradeId: t.id },
        data: { state: "available", reinvestTradeId: null },
      });
    });
    return;
  }
  await investmentService.progress(inv.id);
  const refreshed = await db.investment.findUniqueOrThrow({ where: { id: inv.id } });
  if (refreshed.status === "filled" || refreshed.status === "partial") {
    await db.tradeOrder.update({
      where: { id: t.id },
      data: { status: "filled", amountOut: refreshed.amountOut, venueId: refreshed.quoteId ? (await db.investmentQuote.findUniqueOrThrow({ where: { id: refreshed.quoteId } })).providerId : null },
    });
  } else if (refreshed.status === "failed") {
    await db.tradeOrder.update({ where: { id: t.id }, data: { status: "failed", failureReason: refreshed.failureReason } });
  }
}

export { attachTrade, progressTrade };


