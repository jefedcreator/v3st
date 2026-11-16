import { randomUUID } from "node:crypto";

import { hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { encodeFunctionData, encodePacked, keccak256, zeroAddress, type Address } from "viem";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { BASE_SEPOLIA_CHAIN_ID, assertOnchainContext } from "@/backend/integrations/onchain-policy";
import { settlementTokenAbi } from "@/backend/services/onchain/abis";
import { publicClientOn } from "@/backend/services/onchain/chains";
import { manifestFor } from "@/backend/services/onchain/manifests";
import { chainDeadlineBounded, onchainExpiryMs } from "@/backend/services/onchain/testnet";
import type {
  BetaContext,
  ExecutionPlan,
  ExecutionQuote,
  PreparedCall,
  ProviderCapabilities,
  QuoteRequest,
  SpotAdapter,
} from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { planFingerprint } from "@/backend/services/execution/policy";
import { executionAccounts } from "@/backend/services/wallets/execution-accounts";
import { UnprocessableEntityException } from "@/utils/exceptions";

import { quoteExactIn, readPool } from "./pool";

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

let poolReader: typeof readPool = readPool;

export function __setPoolReaderForTests(fn: typeof readPool): void {
  poolReader = fn;
}

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
    const state = await poolReader(chainId, pool);
    const tokenIn = parseAssetKey(input.input.asset).address;
    const tokenOut = parseAssetKey(input.outputAsset).address;
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
    const tokenIn = parseAssetKey(quote.input.asset).address;
    const tokenOut = parseAssetKey(quote.minOutput.asset).address;
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
