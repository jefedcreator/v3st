import { randomUUID } from "node:crypto";

import { ADDRESS_ZERO, Pool, Position, Token, hydrexPositionManagerABI, hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { encodeFunctionData, encodePacked, keccak256, zeroAddress, type Address } from "viem";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { BASE_SEPOLIA_CHAIN_ID, assertOnchainContext } from "@/backend/integrations/onchain-policy";
import { settlementTokenAbi } from "@/backend/services/onchain/abis";
import { publicClientOn } from "@/backend/services/onchain/chains";
import { manifestFor } from "@/backend/services/onchain/manifests";
import { chainDeadlineBounded, onchainExpiryMs } from "@/backend/services/onchain/testnet";
import type {
  AssetAmount,
  BetaContext,
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
import { assetKey, parseAssetKey } from "@/backend/services/onchain/types";
import { planFingerprint } from "@/backend/services/execution/policy";
import { executionAccounts } from "@/backend/services/wallets/execution-accounts";
import { db } from "@/server/db";
import { fromDbRaw } from "@/utils/asset-units";
import { UnprocessableEntityException } from "@/utils/exceptions";

import { fullRangeTicks, quoteExactIn, readPoolOn } from "./pool";

export { __setPoolReaderForTests } from "./pool";

export const HYDREX_ACTUAL_VERSION = "hydrex-sdk-1.2.8";

export class HydrexActualError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HydrexActualError";
  }
}

export const hydrexActualCapabilities: ProviderCapabilities = {
  id: "hydrex",
  kind: "verified_provider_testnet",
  evidenceId: "evidence:hydrex",
  custody: "application_account",
  spot: true,
  liquidity: true,
  distributions: false,
  separateClaim: true,
  exactOutput: false,
};


function assertActualContext(context: BetaContext): void {
  assertOnchainContext(context);
  if (
    context.chainId !== BASE_SEPOLIA_CHAIN_ID ||
    context.providerId !== "hydrex" ||
    context.integrationKind !== "verified_provider_testnet"
  ) {
    throw new UnprocessableEntityException(
      "hydrex actual adapter only serves Base Sepolia as a verified provider testnet",
      "CAPABILITY_UNAVAILABLE",
    );
  }
}

function manifestEntry(chainId: number, name: string): Address {
  const entry = manifestFor(chainId).external[name];
  if (!entry) throw new UnprocessableEntityException(`Base Sepolia manifest has no ${name}`, "STOCK_UNAVAILABLE");
  return entry.address;
}

class HydrexActualSpotAdapter implements SpotAdapter {
  readonly capabilities = hydrexActualCapabilities;

  async quote(input: QuoteRequest): Promise<ExecutionQuote> {
    assertActualContext(input.context);
    const chainId = input.context.chainId;
    const pool = manifestEntry(chainId, "HydrexPoolAAPL");
    const state = await readPoolOn(chainId, pool);
    const tokenIn = parseAssetKey(input.input.asset).address as Address;
    const tokenOut = parseAssetKey(input.outputAsset).address as Address;
    // The pool must hold exactly this pair: quoteExactIn checks the input token, and
    // the output must be the pool's other token, or the swap would revert on chain.
    const other = tokenIn.toLowerCase() === state.token0.toLowerCase() ? state.token1 : state.token0;
    if (tokenOut.toLowerCase() !== other.toLowerCase() || tokenOut.toLowerCase() === tokenIn.toLowerCase()) {
      throw new UnprocessableEntityException("The Hydrex pool does not trade this asset pair", "STOCK_UNAVAILABLE");
    }
    const { amountOut, priceImpactBps } = quoteExactIn(state, tokenIn, input.input.raw);
    if (priceImpactBps > policy.onchain.maxPriceImpactBps) {
      throw new UnprocessableEntityException(
        `Price impact ${priceImpactBps} bps exceeds policy cap ${policy.onchain.maxPriceImpactBps} bps`,
        "PRICE_IMPACT_EXCEEDED",
      );
    }
    const minOutput = (amountOut * (10_000n - BigInt(input.slippageBps))) / 10_000n;
    const venueFeeRaw = (input.input.raw * BigInt(state.feePips)) / 1_000_000n;
    return {
      id: `hydrexq-${randomUUID()}`,
      userId: input.userId,
      walletId: input.walletId,
      stockId: input.stockId,
      side: input.side,
      context: input.context,
      input: input.input,
      expectedOutput: { asset: input.outputAsset, raw: amountOut },
      minOutput: { asset: input.outputAsset, raw: minOutput },
      userFeeUsdc: 0n,
      venueFee: { asset: input.input.asset, raw: venueFeeRaw },
      sponsorCostWei: 0n,
      allowPartialFill: false,
      priceImpactBps,
      expiresAt: new Date(await onchainExpiryMs(policy.onchain.quoteTtlSeconds, chainId)),
      sourceBlock: await publicClientOn(chainId).getBlockNumber(),
      routeFingerprint: keccak256(encodePacked(["string"], [`hydrex-actual:${pool.toLowerCase()}`])),
    };
  }

  async prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan> {
    assertActualContext(quote.context);
    if (quote.expiresAt <= now()) throw new HydrexActualError("Quote expired before prepare");
    const chainId = quote.context.chainId;
    const router = manifestEntry(chainId, "HydrexSwapRouter");
    const ref = await executionAccounts.find(quote.userId, chainId);
    if (!ref) {
      throw new UnprocessableEntityException("Execution account missing for Base Sepolia", "WALLET_NOT_READY");
    }
    const recipient = ref.accountAddress;
    const tokenIn = parseAssetKey(quote.input.asset).address as Address;
    const tokenOut = parseAssetKey(quote.minOutput.asset).address as Address;
    const deadline = await chainDeadlineBounded(quote.expiresAt.getTime(), undefined, chainId);
    const deadlineSeconds = BigInt(Math.floor(deadline.getTime() / 1000));
    const approveData = encodeFunctionData({
      abi: settlementTokenAbi,
      functionName: "approve",
      args: [router, quote.input.raw],
    });
    const swapData = encodeFunctionData({
      abi: hydrexSwapRouterABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          deployer: zeroAddress,
          recipient,
          deadline: deadlineSeconds,
          amountIn: quote.input.raw,
          amountOutMinimum: quote.minOutput.raw,
          limitSqrtPrice: 0n,
        },
      ],
    });
    const calls: PreparedCall[] = [
      { to: tokenIn, data: approveData, value: 0n },
      { to: router, data: swapData, value: 0n },
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

export const hydrexActualSpot: SpotAdapter = new HydrexActualSpotAdapter();

// Provenance of a real Hydrex NFT position: the NFT id lives in
// StrategyPosition.externalTokenId and its liquidity in receiptRaw (Task 3).
export type HydrexNftProvenance = {
  kind: "hydrex_nft";
  chainId: number;
  pool: Address;
  positionManager: Address;
  stockId: string;
};

const MAX_UINT128 = 2n ** 128n - 1n;

async function positionTokenId(request: StrategyRequest): Promise<bigint> {
  if (!request.positionId) throw new HydrexActualError("Position id required for claim/exit");
  const position = await db.strategyPosition.findUnique({ where: { id: request.positionId } });
  if (!position?.externalTokenId) throw new HydrexActualError("Position has no Hydrex NFT id");
  return fromDbRaw(position.externalTokenId);
}

async function positionLiquidity(chainId: number, positionManager: Address, tokenId: bigint): Promise<bigint> {
  const value = await publicClientOn(chainId).readContract({
    address: positionManager,
    abi: hydrexPositionManagerABI,
    functionName: "positions",
    args: [tokenId],
  });
  return (value as readonly unknown[])[7] as bigint;
}

// Token decimals and symbols do not enter the SDK's raw-amount liquidity math, so the
// pool tokens are described by address only (token0 may be either asset).
function sdkPool(chainId: number, state: Awaited<ReturnType<typeof readPoolOn>>): InstanceType<typeof Pool> {
  const token0 = new Token(chainId, state.token0, 18, "TOKEN0", "Hydrex pool token0");
  const token1 = new Token(chainId, state.token1, 18, "TOKEN1", "Hydrex pool token1");
  return new Pool(
    token0,
    token1,
    state.feePips,
    state.sqrtPriceX96.toString(),
    ADDRESS_ZERO,
    state.liquidity.toString(),
    state.tick,
    state.tickSpacing,
  );
}

class HydrexActualStrategyAdapter implements StrategyAdapter {
  readonly capabilities = hydrexActualCapabilities;

  async quote(input: StrategyRequest): Promise<StrategyQuote> {
    assertActualContext(input.context);
    const chainId = input.context.chainId;
    const pool = manifestEntry(chainId, "HydrexPoolAAPL");
    const strategy = await db.strategy.findUniqueOrThrow({ where: { id: input.strategyId } });
    const expiresAt = new Date(await onchainExpiryMs(policy.onchain.quoteTtlSeconds, chainId));
    const slippage = BigInt(policy.trading.maxSlippageBps);
    if (input.action === "enter") {
      const state = await readPoolOn(chainId, pool);
      const { tickLower, tickUpper } = fullRangeTicks(state.tickSpacing);
      const sdkPoolInstance = sdkPool(chainId, state);
      const amountFor = (token: Address): bigint =>
        input.inputs.find((a) => parseAssetKey(a.asset).address.toLowerCase() === token.toLowerCase())?.raw ?? 0n;
      const position = Position.fromAmounts({
        pool: sdkPoolInstance,
        tickLower,
        tickUpper,
        amount0: amountFor(state.token0).toString(),
        amount1: amountFor(state.token1).toString(),
        useFullPrecision: true,
      });
      // Maximum inputs are the desired amounts, ordered to match request.inputs.
      const maximumInputs: AssetAmount[] = input.inputs.map((a) => {
        const token = parseAssetKey(a.asset).address;
        const desired = token.toLowerCase() === state.token0.toLowerCase()
          ? BigInt(position.mintAmounts.amount0.toString())
          : BigInt(position.mintAmounts.amount1.toString());
        return { asset: a.asset, raw: desired };
      });
      return {
        id: `hydrex-sq-${randomUUID()}`,
        request: input,
        minimumOutputs: [],
        maximumInputs,
        userFeeUsdc: 0n,
        expiresAt,
        strategyVersion: strategy.version,
        disclosureVersion: strategy.disclosureVersion,
        planFingerprint: "",
      };
    }
    if (input.action === "claim") {
      await positionTokenId(input);
      return {
        id: `hydrex-sq-${randomUUID()}`,
        request: input,
        minimumOutputs: [],
        maximumInputs: [],
        userFeeUsdc: 0n,
        expiresAt,
        strategyVersion: strategy.version,
        disclosureVersion: strategy.disclosureVersion,
        planFingerprint: "",
      };
    }
    if (input.action === "exit") {
      const tokenId = await positionTokenId(input);
      const positionManager = manifestEntry(chainId, "HydrexPositionManager");
      const liquidity = await positionLiquidity(chainId, positionManager, tokenId);
      const state = await readPoolOn(chainId, pool);
      const { tickLower, tickUpper } = fullRangeTicks(state.tickSpacing);
      const sdkPoolInstance = sdkPool(chainId, state);
      const position = new Position({ pool: sdkPoolInstance, liquidity: liquidity.toString(), tickLower, tickUpper });
      const amount0 = BigInt(position.amount0.quotient.toString());
      const amount1 = BigInt(position.amount1.quotient.toString());
      const minimumOutputs: AssetAmount[] = input.inputs.map((a) => {
        const token = parseAssetKey(a.asset).address;
        const amount = token.toLowerCase() === state.token0.toLowerCase() ? amount0 : amount1;
        return { asset: a.asset, raw: (amount * (10_000n - slippage)) / 10_000n };
      });
      return {
        id: `hydrex-sq-${randomUUID()}`,
        request: input,
        minimumOutputs,
        maximumInputs: input.inputs,
        userFeeUsdc: 0n,
        expiresAt,
        strategyVersion: strategy.version,
        disclosureVersion: strategy.disclosureVersion,
        planFingerprint: "",
      };
    }
    throw new HydrexActualError(`Unsupported strategy action ${String(input.action)}`);
  }

  async prepare(quote: StrategyQuote, operationId: string): Promise<StrategyPlan> {
    assertActualContext(quote.request.context);
    if (quote.expiresAt <= now()) throw new HydrexActualError("Quote expired before prepare");
    const chainId = quote.request.context.chainId;
    const pool = manifestEntry(chainId, "HydrexPoolAAPL");
    const positionManager = manifestEntry(chainId, "HydrexPositionManager");
    const ref = await executionAccounts.find(quote.request.userId, chainId);
    if (!ref) {
      throw new UnprocessableEntityException("Execution account missing for Base Sepolia", "WALLET_NOT_READY");
    }
    const recipient = ref.accountAddress;
    const deadline = await chainDeadlineBounded(quote.expiresAt.getTime(), undefined, chainId);
    const deadlineSeconds = BigInt(Math.floor(deadline.getTime() / 1000));
    const request = quote.request;
    const slippage = BigInt(policy.trading.maxSlippageBps);
    let calls: PreparedCall[];
    if (request.action === "enter") {
      const state = await readPoolOn(chainId, pool);
      const { tickLower, tickUpper } = fullRangeTicks(state.tickSpacing);
      const sdkPoolInstance = sdkPool(chainId, state);
      const amountFor = (token: Address): bigint =>
        quote.maximumInputs.find((a) => parseAssetKey(a.asset).address.toLowerCase() === token.toLowerCase())?.raw ?? 0n;
      const position = Position.fromAmounts({
        pool: sdkPoolInstance,
        tickLower,
        tickUpper,
        amount0: amountFor(state.token0).toString(),
        amount1: amountFor(state.token1).toString(),
        useFullPrecision: true,
      });
      const amount0Desired = BigInt(position.mintAmounts.amount0.toString());
      const amount1Desired = BigInt(position.mintAmounts.amount1.toString());
      const amount0Min = (amount0Desired * (10_000n - slippage)) / 10_000n;
      const amount1Min = (amount1Desired * (10_000n - slippage)) / 10_000n;
      calls = [
        // Approvals are exact and ordered like the request inputs; the amount is
        // the desired amount the mint will pull (bounded by maximumInputs).
        ...quote.maximumInputs.map((a) => ({
          to: parseAssetKey(a.asset).address as Address,
          data: encodeFunctionData({
            abi: settlementTokenAbi,
            functionName: "approve",
            args: [positionManager, a.raw],
          }),
          value: 0n,
        })),
        {
          to: positionManager,
          data: encodeFunctionData({
            abi: hydrexPositionManagerABI,
            functionName: "mint",
            args: [
              {
                token0: state.token0,
                token1: state.token1,
                // Base (non-custom) Algebra pool: the custom-deployer slot is zero, as
                // in the swap and in the SDK's computePoolAddress.
                deployer: zeroAddress,
                tickLower,
                tickUpper,
                amount0Desired,
                amount1Desired,
                amount0Min,
                amount1Min,
                recipient,
                deadline: deadlineSeconds,
              },
            ],
          }),
          value: 0n,
        },
      ];
    } else if (request.action === "claim") {
      const tokenId = await positionTokenId(request);
      calls = [
        {
          to: positionManager,
          data: encodeFunctionData({
            abi: hydrexPositionManagerABI,
            functionName: "collect",
            args: [{ tokenId, recipient, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
          }),
          value: 0n,
        },
      ];
    } else {
      const tokenId = await positionTokenId(request);
      const liquidity = await positionLiquidity(chainId, positionManager, tokenId);
      const minimumOf = (asset: string): bigint => quote.minimumOutputs.find((a) => a.asset === asset)?.raw ?? 0n;
      const state = await readPoolOn(chainId, pool);
      const amount0Min = minimumOf(assetKey("basesepolia", chainId, state.token0));
      const amount1Min = minimumOf(assetKey("basesepolia", chainId, state.token1));
      calls = [
        {
          to: positionManager,
          data: encodeFunctionData({
            abi: hydrexPositionManagerABI,
            functionName: "decreaseLiquidity",
            args: [{ tokenId, liquidity, amount0Min, amount1Min, deadline: deadlineSeconds }],
          }),
          value: 0n,
        },
        {
          to: positionManager,
          data: encodeFunctionData({
            abi: hydrexPositionManagerABI,
            functionName: "collect",
            args: [{ tokenId, recipient, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
          }),
          value: 0n,
        },
      ];
    }
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId_family: { userId: quote.request.userId, family: "evm" } } });
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

export const hydrexActualStrategy: StrategyAdapter = new HydrexActualStrategyAdapter();
