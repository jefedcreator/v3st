import { randomUUID } from "node:crypto";

import { type Address, encodeFunctionData, encodePacked, keccak256 } from "viem";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { hydrexPoolAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import type {
  AssetAmount,
  ExecutionPlan,
  ExecutionQuote,
  PreparedCall,
  ProviderCapabilities,
  QuoteRequest,
  SpotAdapter,
  StrategyAdapter,
  StrategyPlan,
  StrategyQuote,
  StrategyRequest,
} from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { planFingerprint } from "@/backend/services/execution/policy";
import { onchainExpiryMs, 
  chainDeadlineBounded,
  publicClientFor,
  readManifest,
  settlementAssetKey,
 } from "@/backend/services/onchain/testnet";
import { db } from "@/server/db";
import { UnprocessableEntityException } from "@/utils/exceptions";

import { HYDREX_SCHEMA_VERSION, parseHydrexQuote, type HydrexQuoteResponse } from "./schemas";

export const HYDREX_FIXTURE_FEE_BPS = 30;

export class HydrexReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HydrexReplicaError";
  }
}

export const hydrexSpotCapabilities: ProviderCapabilities = {
  id: "hydrex",
  kind: "local_testnet_replica",
  evidenceId: "evidence:hydrex",
  custody: "application_account",
  spot: true,
  liquidity: true,
  distributions: false,
  separateClaim: true,
  exactOutput: false,
};

// Distinct exit-realized variant: exit claims fees together with principal.
export const hydrexExitRealizedCapabilities: ProviderCapabilities = {
  ...hydrexSpotCapabilities,
  separateClaim: false,
};

export type HydrexStrategyProvenance = { pool: string; stockId: string };

export function poolAddressOf(strategy: { provenance: unknown }): Address {
  const prov = strategy.provenance as HydrexStrategyProvenance | null;
  if (!prov || typeof prov.pool !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(prov.pool)) {
    throw new HydrexReplicaError("Strategy has no hydrex pool provenance");
  }
  return prov.pool as Address;
}

async function strategyContext(input: StrategyRequest): Promise<{
  pool: Address;
  stock: { id: string; assetKey: string; decimals: number };
  settlement: string;
}> {
  if (input.context.chainId !== 31337 || input.context.providerId !== "hydrex") {
    throw new UnprocessableEntityException("hydrex replica only serves the local testnet", "CAPABILITY_UNAVAILABLE");
  }
  const strategy = await db.strategy.findUnique({ where: { id: input.strategyId } });
  if (!strategy) throw new UnprocessableEntityException("Unknown strategy", "STRATEGY_UNAVAILABLE");
  const pool = poolAddressOf(strategy);
  const prov = strategy.provenance as HydrexStrategyProvenance;
  const stock = await db.stock.findUnique({ where: { id: prov.stockId } });
  if (!stock?.assetKey) throw new UnprocessableEntityException("Strategy stock has no asset key", "STOCK_UNAVAILABLE");
  return { pool, stock: { id: stock.id, assetKey: stock.assetKey, decimals: stock.decimals }, settlement: settlementAssetKey(readManifest()) };
}

async function poolUint(pool: Address, functionName: "reserveSettlement" | "reserveStock" | "totalShares"): Promise<bigint> {
  const value: unknown = await publicClientFor().readContract({ address: pool, abi: hydrexPoolAbi, functionName });
  return value as bigint;
}

async function poolAsset(pool: Address, functionName: "settlement" | "stock"): Promise<Address> {
  const value: unknown = await publicClientFor().readContract({ address: pool, abi: hydrexPoolAbi, functionName });
  return value as Address;
}

async function poolClaimableFees(pool: Address, account: Address): Promise<[bigint, bigint]> {
  const value: unknown = await publicClientFor().readContract({
    address: pool,
    abi: hydrexPoolAbi,
    functionName: "claimableFees",
    args: [account],
  });
  return value as [bigint, bigint];
}

async function poolState(pool: Address): Promise<{ reserveSettlement: bigint; reserveStock: bigint }> {
  const [reserveSettlement, reserveStock] = await Promise.all([
    poolUint(pool, "reserveSettlement"),
    poolUint(pool, "reserveStock"),
  ]);
  return { reserveSettlement, reserveStock };
}

async function localQuoteTransport(
  input: QuoteRequest,
  pool: Address,
  tokenIn: Address,
  _tokenOut: Address,
): Promise<HydrexQuoteResponse> {
  const { reserveSettlement, reserveStock } = await poolState(pool);
  const settlementIn = tokenIn.toLowerCase() === (await poolAsset(pool, "settlement")).toLowerCase();
  const reserveIn = settlementIn ? reserveSettlement : reserveStock;
  const reserveOut = settlementIn ? reserveStock : reserveSettlement;
  const fee = (input.input.raw * BigInt(HYDREX_FIXTURE_FEE_BPS)) / 10_000n;
  const net = input.input.raw - fee;
  const expectedOut = reserveIn === 0n || reserveOut === 0n ? 0n : (net * reserveOut) / (reserveIn + net);
  const minOut = (expectedOut * (10_000n - BigInt(input.slippageBps))) / 10_000n;
  const impactBps = reserveIn === 0n ? 10_000 : Number((net * 10_000n) / reserveIn);
  return parseHydrexQuote({
    quoteId: `hydrexq-${randomUUID()}`,
    schemaVersion: HYDREX_SCHEMA_VERSION,
    chainId: input.context.chainId,
    pool,
    input: { asset: input.input.asset, raw: input.input.raw.toString() },
    output: { asset: input.outputAsset, raw: expectedOut.toString() },
    minOutput: { asset: input.outputAsset, raw: minOut.toString() },
    fee: { asset: input.input.asset, raw: fee.toString(), bps: HYDREX_FIXTURE_FEE_BPS },
    priceImpactBps: Math.min(impactBps, 10_000),
    expiresAt: new Date(await onchainExpiryMs(policy.onchain.quoteTtlSeconds)).toISOString(),
  });
}

async function poolOfStock(stockId: string): Promise<Address> {
  const stock = await db.stock.findUnique({ where: { id: stockId } });
  const pool = (stock?.provenance as { hydrexPool?: string } | null)?.hydrexPool;
  if (!stock?.assetKey || !pool) {
    throw new UnprocessableEntityException("Stock has no hydrex pool provenance", "STOCK_UNAVAILABLE");
  }
  return pool as Address;
}

class HydrexSpotReplicaAdapter implements SpotAdapter {
  readonly capabilities = hydrexSpotCapabilities;

  async quote(input: QuoteRequest): Promise<ExecutionQuote> {
    if (input.context.chainId !== 31337 || input.context.providerId !== "hydrex") {
      throw new UnprocessableEntityException("hydrex replica only serves the local testnet", "CAPABILITY_UNAVAILABLE");
    }
    const stock = await db.stock.findUnique({ where: { id: input.stockId } });
    if (!stock?.assetKey) throw new UnprocessableEntityException("Stock has no asset key", "STOCK_UNAVAILABLE");
    const pool = await poolOfStock(input.stockId);
    const settlement = settlementAssetKey(readManifest());
    const buy = input.side === "buy";
    const tokenIn = (buy ? parseAssetKey(settlement).address : parseAssetKey(stock.assetKey).address) as Address;
    const tokenOut = (buy ? parseAssetKey(stock.assetKey).address : parseAssetKey(settlement).address) as Address;
    const parsed = await localQuoteTransport(input, pool, tokenIn, tokenOut);
    if (parsed.input.asset !== input.input.asset || parsed.input.raw !== input.input.raw) {
      throw new HydrexReplicaError("Quote input does not match the request");
    }
    if (parsed.fee.raw !== (input.input.raw * BigInt(HYDREX_FIXTURE_FEE_BPS)) / 10_000n) {
      throw new HydrexReplicaError("Hidden or unexpected output fee in pool quote");
    }
    const expiryMs = Math.min(
      new Date(parsed.expiresAt).getTime(),
      await onchainExpiryMs(policy.onchain.quoteTtlSeconds),
    );
    return {
      id: parsed.quoteId,
      userId: input.userId,
      walletId: input.walletId,
      stockId: input.stockId,
      side: input.side,
      context: input.context,
      input: { asset: parsed.input.asset, raw: parsed.input.raw },
      expectedOutput: { asset: parsed.output.asset, raw: parsed.output.raw },
      minOutput: { asset: parsed.minOutput.asset, raw: parsed.minOutput.raw },
      userFeeUsdc: 0n,
      venueFee: { asset: parsed.fee.asset, raw: parsed.fee.raw },
      sponsorCostWei: 0n,
      allowPartialFill: input.allowPartialFill ?? false,
      priceImpactBps: parsed.priceImpactBps,
      expiresAt: new Date(expiryMs),
      sourceBlock: await publicClientFor().getBlockNumber(),
      routeFingerprint: keccak256(encodePacked(["string"], [`hydrex-pool:${pool.toLowerCase()}`])),
    };
  }

  async prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan> {
    if (quote.expiresAt <= now()) throw new HydrexReplicaError("Quote expired before prepare");
    if (quote.context.chainId !== 31337 || quote.context.integrationKind !== "local_testnet_replica" || quote.context.providerId !== "hydrex") {
      throw new HydrexReplicaError("Foreign quote context rejected");
    }
    const pool = await poolOfStock(quote.stockId);
    const stock = await db.stock.findUniqueOrThrow({ where: { id: quote.stockId } });
    const wallet = await db.wallet.findUniqueOrThrow({ where: { id: quote.walletId } });
    const recipient = wallet.executionAddress as Address;
    if (!recipient) throw new HydrexReplicaError("Execution account missing");
    const settlement = settlementAssetKey(readManifest());
    const buy = quote.input.asset === settlement;
    const tokenIn = (buy ? parseAssetKey(settlement).address : parseAssetKey(stock.assetKey!).address) as Address;
    const tokenOut = (buy ? parseAssetKey(stock.assetKey!).address : parseAssetKey(settlement).address) as Address;
    const deadline = await chainDeadlineBounded(quote.expiresAt.getTime());
    const swapData = encodeFunctionData({
      abi: hydrexPoolAbi,
      functionName: "swapExactIn",
      args: [tokenIn, tokenOut, quote.input.raw, quote.minOutput.raw, recipient, BigInt(Math.floor(deadline.getTime() / 1000))],
    });
    const approveData = encodeFunctionData({
      abi: buy ? settlementTokenAbi : stockTokenAbi,
      functionName: "approve",
      args: [pool, quote.input.raw],
    });
    const calls: PreparedCall[] = [
      { to: tokenIn, data: approveData, value: 0n },
      { to: pool, data: swapData, value: 0n },
    ];
    const plan: ExecutionPlan = {
      operationId,
      quoteId: quote.id,
      walletId: quote.walletId,
      context: quote.context,
      calls,
      expectedInput: quote.input,
      minimumOutput: quote.minOutput,
      recipient,
      deadline,
      fingerprint: "",
    };
    plan.fingerprint = planFingerprint(plan);
    return plan;
  }
}

class HydrexStrategyReplicaAdapter implements StrategyAdapter {
  constructor(private readonly exitRealized: boolean) {}

  get capabilities(): ProviderCapabilities {
    return this.exitRealized ? hydrexExitRealizedCapabilities : hydrexSpotCapabilities;
  }

  async quote(input: StrategyRequest): Promise<StrategyQuote> {
    const { pool, stock, settlement } = await strategyContext(input);
    const expiresAt = new Date(await onchainExpiryMs(policy.onchain.quoteTtlSeconds));
    const strategy = await db.strategy.findUniqueOrThrow({ where: { id: input.strategyId } });
    if (input.action === "enter") {
      const settlementIn = input.inputs.find((a) => a.asset === settlement);
      const stockIn = input.inputs.find((a) => a.asset === stock.assetKey);
      if (!settlementIn || !stockIn) throw new HydrexReplicaError("Enter requires settlement and stock inputs");
      const { reserveSettlement, reserveStock } = await poolState(pool);
      const totalShares = await poolUint(pool, "totalShares");
      let shares = settlementIn.raw;
      if (totalShares > 0n) {
        const bySettlement = (settlementIn.raw * totalShares) / reserveSettlement;
        const byStock = (stockIn.raw * totalShares) / reserveStock;
        shares = bySettlement < byStock ? bySettlement : byStock;
      }
      return {
        id: `hydrex-sq-${randomUUID()}`,
        request: input,
        minimumOutputs: [],
        maximumInputs: [settlementIn, stockIn],
        userFeeUsdc: 0n,
        expiresAt,
        strategyVersion: strategy.version,
        disclosureVersion: strategy.disclosureVersion,
        planFingerprint: "",
      };
    }
    if (input.action === "claim") {
      if (this.exitRealized) {
        // Embedded fees realize on exit only; this variant declares no separate claim.
        throw new HydrexReplicaError("Fees are embedded in exit value; separate claim is unsupported for this strategy");
      }
      // Claimable fees are read for the user's execution account, which is also the
      // plan recipient resolved at prepare time.
      const walletRow = await db.wallet.findFirst({ where: { userId: input.userId, family: "evm" } });
      if (!walletRow?.executionAddress) throw new HydrexReplicaError("Execution account missing");
      const accountAddress = walletRow.executionAddress as Address;
      const claimable = await poolClaimableFees(pool, accountAddress);
      return {
        id: `hydrex-sq-${randomUUID()}`,
        request: input,
        minimumOutputs: [
          { asset: settlement, raw: claimable[0] },
          { asset: stock.assetKey, raw: claimable[1] },
        ],
        maximumInputs: [],
        userFeeUsdc: 0n,
        expiresAt,
        strategyVersion: strategy.version,
        disclosureVersion: strategy.disclosureVersion,
        planFingerprint: "",
      };
    }
    if (input.action === "exit") {
      const shares = input.inputs[0]?.raw ?? 0n;
      if (shares <= 0n) throw new HydrexReplicaError("Exit requires the position receipt amount as input");
      const { reserveSettlement, reserveStock } = await poolState(pool);
      const totalShares = await poolUint(pool, "totalShares");
      const settlementOut = totalShares === 0n ? 0n : (shares * reserveSettlement) / totalShares;
      const stockOut = totalShares === 0n ? 0n : (shares * reserveStock) / totalShares;
      return {
        id: `hydrex-sq-${randomUUID()}`,
        request: input,
        minimumOutputs: [
          { asset: settlement, raw: settlementOut },
          { asset: stock.assetKey, raw: stockOut },
        ],
        maximumInputs: input.inputs,
        userFeeUsdc: 0n,
        expiresAt,
        strategyVersion: strategy.version,
        disclosureVersion: strategy.disclosureVersion,
        planFingerprint: "",
      };
    }
    throw new HydrexReplicaError(`Unsupported strategy action ${String(input.action)}`);
  }

  async prepare(quote: StrategyQuote, operationId: string): Promise<StrategyPlan> {
    if (quote.expiresAt <= now()) throw new HydrexReplicaError("Quote expired before prepare");
    if (quote.request.context.chainId !== 31337 || quote.request.context.providerId !== "hydrex") {
      throw new HydrexReplicaError("Foreign quote context rejected");
    }
    const { pool, stock, settlement } = await strategyContext(quote.request);
    const wallet = await db.wallet.findFirstOrThrow({ where: { userId: quote.request.userId, family: "evm" } });
    const recipient = wallet.executionAddress as Address;
    if (!recipient) throw new HydrexReplicaError("Execution account missing");
    const deadline = await chainDeadlineBounded(quote.expiresAt.getTime());
    const request = quote.request;
    let calls: PreparedCall[];
    if (request.action === "enter") {
      const settlementIn = quote.maximumInputs.find((a) => a.asset === settlement)!;
      const stockIn = quote.maximumInputs.find((a) => a.asset === stock.assetKey)!;
      const { reserveSettlement, reserveStock } = await poolState(pool);
      const totalShares = await poolUint(pool, "totalShares");
      let shares = settlementIn.raw;
      if (totalShares > 0n) {
        const bySettlement = (settlementIn.raw * totalShares) / reserveSettlement;
        const byStock = (stockIn.raw * totalShares) / reserveStock;
        shares = bySettlement < byStock ? bySettlement : byStock;
      }
      calls = [
        {
          to: parseAssetKey(settlement).address as Address,
          data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [pool, settlementIn.raw] }),
          value: 0n,
        },
        {
          to: parseAssetKey(stock.assetKey).address as Address,
          data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [pool, stockIn.raw] }),
          value: 0n,
        },
        {
          to: pool,
          data: encodeFunctionData({
            abi: hydrexPoolAbi,
            functionName: "deposit",
            args: [settlementIn.raw, stockIn.raw, shares, recipient],
          }),
          value: 0n,
        },
      ];
    } else if (request.action === "claim") {
      if (this.exitRealized) {
        throw new HydrexReplicaError("Fees are embedded in exit value; separate claim is unsupported for this strategy");
      }
      calls = [
        {
          to: pool,
          data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "claimFees", args: [recipient] }),
          value: 0n,
        },
      ];
    } else {
      const shares = request.inputs[0]?.raw ?? 0n;
      const settleOut = quote.minimumOutputs.find((a) => a.asset === settlement)!;
      const stockOut = quote.minimumOutputs.find((a) => a.asset === stock.assetKey)!;
      const fn = this.exitRealized ? "withdrawAndClaim" : "withdraw";
      calls = [
        {
          to: pool,
          data: encodeFunctionData({
            abi: hydrexPoolAbi,
            functionName: fn,
            args: [shares, settleOut.raw, stockOut.raw, recipient],
          }),
          value: 0n,
        },
      ];
    }
    const plan: StrategyPlan = {
      operationId,
      quoteId: quote.id,
      walletId: wallet.id,
      context: quote.request.context,
      calls,
      maximumInputs: quote.maximumInputs,
      minimumOutputs: quote.minimumOutputs,
      recipient,
      deadline,
      fingerprint: "",
    };
    plan.fingerprint = planFingerprint(plan);
    return plan;
  }
}

export const hydrexSpotReplica: SpotAdapter = new HydrexSpotReplicaAdapter();
// Manual-fee fixture: fees are claimed separately from principal.
export const hydrexStrategyReplica: StrategyAdapter = new HydrexStrategyReplicaAdapter(false);
// Exit-realized variant: exit claims fees together with principal (separateClaim false).
export const hydrexExitRealizedStrategyReplica: StrategyAdapter = new HydrexStrategyReplicaAdapter(true);

export type { AssetAmount };
