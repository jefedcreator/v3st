import { randomUUID } from "node:crypto";

import { type Address, type Hex, encodeFunctionData, encodePacked, keccak256 } from "viem";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { o1RouterAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
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
import {
  chainDeadlineFromNow,
  publicClientFor,
  readManifest,
  settlementAssetKey,
} from "@/backend/services/onchain/testnet";
import { db } from "@/server/db";
import { UnprocessableEntityException } from "@/utils/exceptions";

import { fixtureQuoteOut, partialFillBps, poolReserves, routerAddress } from "../router-pool";
import {
  BANKR_SCHEMA_VERSION,
  type BankrQuoteResponse,
  parseBankrQuote,
  rawToDecimalString,
} from "./schemas";

export const BANKR_FIXTURE_FEE_BPS = 50;

export class BankrReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankrReplicaError";
  }
}

export const bankrCapabilities: ProviderCapabilities = {
  id: "bankr",
  kind: "local_testnet_replica",
  evidenceId: "evidence:bankr",
  custody: "provider_managed",
  spot: true,
  liquidity: false,
  distributions: false,
  separateClaim: false,
  exactOutput: false,
};

// The Bankr gateway only serves per-customer provider_managed custody profiles.
// Ordinary application-account (Privy-provisioned) wallets cannot route here, and
// a successful quote never grants stock eligibility or location clearance.
export async function managedAccountOf(
  context: BetaContext,
  walletId: string,
): Promise<{ profileId: string; managedAddress: Address }> {
  const profile = await db.custodyProfile.findUnique({ where: { id: context.custodyProfileId } });
  if (
    profile?.kind !== "provider_managed" ||
    !profile.managedAddress ||
    profile.walletId !== walletId
  ) {
    throw new UnprocessableEntityException(
      "Bankr routing requires a per-customer provider_managed custody profile; application-account wallets cannot use the Bankr gateway",
      "CAPABILITY_UNAVAILABLE",
    );
  }
  return { profileId: profile.id, managedAddress: profile.managedAddress as Address };
}

// Local transport producing the synthetic Bankr Wallet API quote shape (decimal
// strings + decimals) from onchain pool state; parsed strictly, converted exactly.
async function localQuoteTransport(
  input: QuoteRequest,
  tokenIn: Address,
  tokenOut: Address,
  decimalsIn: number,
  decimalsOut: number,
): Promise<BankrQuoteResponse> {
  const { reserveIn, reserveOut } = await poolReserves(tokenIn, tokenOut);
  const partial = await partialFillBps();
  const fee = (input.input.raw * BigInt(BANKR_FIXTURE_FEE_BPS)) / 10_000n;
  const net = input.input.raw - fee;
  let expectedOut = fixtureQuoteOut(reserveIn, reserveOut, net);
  if (partial < 10_000n) {
    expectedOut = (expectedOut * partial) / 10_000n;
  }
  const minOut = (expectedOut * (10_000n - BigInt(input.slippageBps))) / 10_000n;
  const impactBps = reserveIn === 0n ? 10_000 : Number((net * 10_000n) / reserveIn);
  const payload = {
    quoteId: `bankrq-${randomUUID()}`,
    schemaVersion: BANKR_SCHEMA_VERSION,
    chainId: input.context.chainId,
    input: { asset: input.input.asset, amount: rawToDecimalString(input.input.raw, decimalsIn), decimals: decimalsIn },
    output: { asset: input.outputAsset, amount: rawToDecimalString(expectedOut, decimalsOut), decimals: decimalsOut },
    minOutput: { asset: input.outputAsset, amount: rawToDecimalString(minOut, decimalsOut), decimals: decimalsOut },
    fee: {
      asset: input.input.asset,
      amount: rawToDecimalString(fee, decimalsIn),
      decimals: decimalsIn,
      bps: BANKR_FIXTURE_FEE_BPS,
    },
    priceImpactBps: Math.min(impactBps, 10_000),
    expiresAt: new Date(now().getTime() + policy.onchain.quoteTtlSeconds * 1000).toISOString(),
    locationClearance: "required_separately" as const,
  };
  return parseBankrQuote(payload);
}

class BankrReplicaAdapter implements SpotAdapter {
  readonly capabilities = bankrCapabilities;

  async quote(input: QuoteRequest): Promise<ExecutionQuote> {
    if (input.context.chainId !== 31337 || input.context.providerId !== "bankr") {
      throw new UnprocessableEntityException("bankr replica only serves the local testnet", "CAPABILITY_UNAVAILABLE");
    }
    await managedAccountOf(input.context, input.walletId);
    const stock = await db.stock.findUnique({ where: { id: input.stockId } });
    if (!stock?.assetKey) throw new UnprocessableEntityException("Stock has no asset key", "STOCK_UNAVAILABLE");
    const manifest = readManifest();
    const settlement = settlementAssetKey(manifest);
    const buy = input.side === "buy";
    const tokenIn = (buy ? parseAssetKey(settlement).address : parseAssetKey(stock.assetKey).address) as Address;
    const tokenOut = (buy ? parseAssetKey(stock.assetKey).address : parseAssetKey(settlement).address) as Address;
    const parsed = await localQuoteTransport(input, tokenIn, tokenOut, 6, stock.decimals);

    if (parsed.input.asset !== input.input.asset || parsed.input.raw !== input.input.raw) {
      throw new BankrReplicaError("Quote input does not match the request");
    }
    if (parsed.fee.raw !== (input.input.raw * BigInt(BANKR_FIXTURE_FEE_BPS)) / 10_000n) {
      throw new BankrReplicaError("Hidden or unexpected output fee in gateway quote");
    }
    const expiryMs = Math.min(
      new Date(parsed.expiresAt).getTime(),
      now().getTime() + policy.onchain.quoteTtlSeconds * 1000,
    );
    return {
      id: parsed.quoteId,
      userId: input.userId,
      walletId: input.walletId,
      stockId: input.stockId,
      context: input.context,
      input: { asset: parsed.input.asset, raw: parsed.input.raw },
      expectedOutput: { asset: parsed.output.asset, raw: parsed.output.raw },
      minOutput: { asset: parsed.minOutput.asset, raw: parsed.minOutput.raw },
      userFeeUsdc: 0n,
      sponsorCostWei: 0n,
      priceImpactBps: parsed.priceImpactBps,
      expiresAt: new Date(expiryMs),
      sourceBlock: await publicClientFor().getBlockNumber(),
      routeFingerprint: keccak256(encodePacked(["string"], ["bankr-managed-wallet-replica"])),
    };
  }

  async prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan> {
    if (quote.expiresAt <= now()) {
      throw new BankrReplicaError("Quote expired before prepare");
    }
    if (
      quote.context.chainId !== 31337 ||
      quote.context.integrationKind !== "local_testnet_replica" ||
      quote.context.providerId !== "bankr"
    ) {
      throw new BankrReplicaError("Foreign quote context rejected");
    }
    const { managedAddress } = await managedAccountOf(quote.context, quote.walletId);
    const manifest = readManifest();
    const stock = await db.stock.findUnique({ where: { id: quote.stockId } });
    if (!stock?.assetKey) throw new BankrReplicaError("Stock has no asset key");
    const settlement = settlementAssetKey(manifest);
    const buy = quote.input.asset === settlement;
    const tokenIn = (buy ? parseAssetKey(settlement).address : parseAssetKey(stock.assetKey).address) as Address;
    const tokenOut = (buy ? parseAssetKey(stock.assetKey).address : parseAssetKey(settlement).address) as Address;
    const deadline = await chainDeadlineFromNow();
    const swapData = encodeFunctionData({
      abi: o1RouterAbi,
      functionName: "swapExactIn",
      args: [tokenIn, tokenOut, quote.input.raw, quote.minOutput.raw, managedAddress, BigInt(Math.floor(deadline.getTime() / 1000))],
    });
    const approveData = encodeFunctionData({
      abi: buy ? settlementTokenAbi : stockTokenAbi,
      functionName: "approve",
      args: [routerAddress(), quote.input.raw],
    });
    const calls: PreparedCall[] = [
      { to: tokenIn, data: approveData, value: 0n },
      { to: routerAddress(), data: swapData, value: 0n },
    ];
    const plan: ExecutionPlan = {
      operationId,
      quoteId: quote.id,
      walletId: quote.walletId,
      context: quote.context,
      calls,
      expectedInput: quote.input,
      minimumOutput: quote.minOutput,
      recipient: managedAddress,
      deadline,
      fingerprint: "",
    };
    plan.fingerprint = planFingerprint(plan);
    return plan;
  }
}

export const bankrReplica: SpotAdapter = new BankrReplicaAdapter();
