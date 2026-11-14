import { type Address } from "viem";

import { type Investment, type InvestmentQuote, type TradePurpose, type TradeSide, Prisma } from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { authorizationService } from "@/backend/services/authorizations";
import { executionService, pack, unpack } from "@/backend/services/execution";
import { jobService } from "@/backend/services/jobs";
import { ledgerService } from "@/backend/services/ledger";
import { cashReleased, cashReserved, stockReleased, stockReserved, tradeFilled } from "@/backend/services/ledger/postings";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import { settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type { AssetAmount, BetaContext, ExecutionQuote, StockProviderId } from "@/backend/services/onchain/types";
import { referenceUsable } from "@/backend/services/stocks/reference";
import { stockService } from "@/backend/services/stocks";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, fromDbRawNullable, toDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

export type InvestmentQuoteInput = {
  stockId: string;
  side: "buy" | "sell";
  inputRaw: bigint;
  budgetNgn?: bigint;
  slippageBps?: number;
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
  provider_id: string;
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
    provider_id: providerId,
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
const SPOT_PROVIDERS: StockProviderId[] = ["bankr", "hydrex", "o1"];

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
    const manifest = (await import("@/backend/services/onchain/testnet")).readManifest();
    const settlement = settlementAssetKey(manifest);
    const slippageBps = input.slippageBps ?? policy.trading.maxSlippageBps;

    const candidates = await Promise.all(
      SPOT_PROVIDERS.map(async (providerId) => {
        try {
          const profile = await custodyProfileFor(db, userId, providerId);
          const context = await testnetService.defaultContext(providerId, "replica-1.0.0", profile.id);
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
                raw: input.inputRaw,
              },
              outputAsset: side === "buy" ? stock.assetKey! : settlement,
              slippageBps,
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
    const expiresAt = new Date(Math.min(best.quote.expiresAt.getTime(), now().getTime() + 30_000));
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
        feeUsdc: toDbRaw(0n),
        fxFeeUsdc: toDbRaw(0n),
        venueFeeUsdc: toDbRaw(0n),
        priceImpactBps: best.quote.priceImpactBps,
        providerId: best.providerId,
        providerVersion: best.context.providerVersion,
        context: {
          betaContext: best.context,
          executionQuote: {
            id: best.quote.id,
            userId,
            walletId: best.quote.walletId,
            stockId: input.stockId,
            context: best.context,
            input: { asset: best.quote.input.asset, raw: best.quote.input.raw.toString() },
            expectedOutput: { asset: best.quote.expectedOutput.asset, raw: best.quote.expectedOutput.raw.toString() },
            minOutput: { asset: best.quote.minOutput.asset, raw: best.quote.minOutput.raw.toString() },
            userFeeUsdc: "0",
            sponsorCostWei: "0",
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
  ): Promise<InvestmentDto> {
    const requestHash = sha256Hex(canonicalJson({ quoteId, authorizationId, key }));
    return withTx(async (tx) => {
      const existing = await tx.investment.findUnique({ where: { key } });
      if (existing) {
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
      await authorizationService.check(tx, userId, authorizationId, {
        scope: "investments",
        stockId: quote.stockId,
        amountUsdc: fromDbRaw(quote.inputRaw),
      });
      const context = quote.context as {
        betaContext: BetaContext;
        executionQuote: {
          id: string;
          walletId: string;
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
        context: context.betaContext,
        input: { asset: eq.input.asset, raw: BigInt(eq.input.raw) },
        expectedOutput: { asset: eq.expectedOutput.asset, raw: BigInt(eq.expectedOutput.raw) },
        minOutput: { asset: eq.minOutput.asset, raw: BigInt(eq.minOutput.raw) },
        userFeeUsdc: BigInt(eq.userFeeUsdc ?? "0"),
        sponsorCostWei: BigInt(eq.sponsorCostWei ?? "0"),
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
      await jobService.enqueue(tx, { kind: "operation.progress", subjectId: op.id });
      return investmentToDto(updated, quote.providerId);
    }, { timeoutMs: 30_000 });
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
    await executionService.progress(inv.operationId);
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operationId } });
    if (op.status === "finalized" && before !== "filled") {
      const actual = unpack(op.actual) as { input?: AssetAmount; output?: AssetAmount };
      const expectedQuote = unpack((op.expected as { quote?: unknown }).quote) as ExecutionQuote;
      const stock = await stockService.get(inv.stockId);
      await withTx(async (tx) => {
        const current = await tx.investment.findUniqueOrThrow({ where: { id: inv.id } });
        if (current.status === "filled") return;
        const amountOut = actual.output?.raw ?? 0n;
        await ledgerService.post(
          tx,
          tradeFilled({
            id: current.id,
            userId: current.userId,
            chain: stock.chain,
            venueId: op.providerId,
            stockId: current.stockId,
            side: current.side,
            amountIn: actual.input?.raw ?? fromDbRaw(current.amountIn),
            amountOut,
          }),
        );
        // Actual output below the quoted expectation is a partial fill; only the
        // actual input is spent and the remainder needs a fresh quote (single-use).
        const expectedOut = expectedQuote.expectedOutput.raw;
        await tx.investment.update({
          where: { id: current.id },
          data: {
            status: amountOut < expectedOut ? "partial" : "filled",
            amountOut: toDbRaw(amountOut),
          },
        });
      });
      return;
    }
    if (op.status === "reverted" && !["failed", "cancelled"].includes(before)) {
      const stock = await stockService.get(inv.stockId);
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


