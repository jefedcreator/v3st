import { randomUUID } from "node:crypto";

import {
  type Address,
  type Hex,
  encodeFunctionData,
  encodePacked,
  keccak256,
} from "viem";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { o1RouterAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import { fixtureQuoteOut, partialFillBps, poolReserves, routerAddress } from "../router-pool";
import type {
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

import { O1_SCHEMA_VERSION, parseO1Prepared, parseO1Quote, type O1QuoteResponse } from "./schemas";

export const O1_FIXTURE_FEE_BPS = 50;

export class O1ReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "O1ReplicaError";
  }
}

export const o1Capabilities: ProviderCapabilities = {
  id: "o1",
  kind: "local_testnet_replica",
  evidenceId: "evidence:o1",
  custody: "application_account",
  spot: true,
  liquidity: false,
  distributions: false,
  separateClaim: false,
  exactOutput: false,
};

// A provider plan with a hidden fee must be rejected even with HTTP 200.
export function assertFeeConsistency(parsed: O1QuoteResponse, inputRaw: bigint): void {
  const expectedFee = (inputRaw * BigInt(O1_FIXTURE_FEE_BPS)) / 10_000n;
  if (parsed.fee.raw !== expectedFee || parsed.fee.bps !== O1_FIXTURE_FEE_BPS) {
    throw new O1ReplicaError("Hidden or unexpected output fee in provider quote");
  }
  if (parsed.minOutput.raw > parsed.output.raw) {
    throw new O1ReplicaError("Minimum output exceeds quoted output");
  }
}

// Local transport producing the documented aggregator response shape from onchain
// pool state; the response is then parsed strictly by the schema (untrusted input).
async function localQuoteTransport(input: QuoteRequest, tokenIn: Address, tokenOut: Address): Promise<O1QuoteResponse> {
  const { reserveIn, reserveOut, settlementIn } = await poolReserves(tokenIn, tokenOut);
  const partial = await partialFillBps();
  const fee = (input.input.raw * BigInt(O1_FIXTURE_FEE_BPS)) / 10_000n;
  const net = input.input.raw - fee;
  let expectedOut = fixtureQuoteOut(reserveIn, reserveOut, net);
  if (partial < 10_000n) {
    expectedOut = (expectedOut * partial) / 10_000n;
  }
  const minOut = (expectedOut * (10_000n - BigInt(input.slippageBps))) / 10_000n;
  const impactBps = reserveIn === 0n ? 10_000 : Number((net * 10_000n) / reserveIn);
  const payload = {
    quoteId: `o1q-${randomUUID()}`,
    schemaVersion: O1_SCHEMA_VERSION,
    chainId: input.context.chainId,
    input: { asset: input.input.asset, raw: input.input.raw.toString() },
    output: { asset: input.outputAsset, raw: expectedOut.toString() },
    minOutput: { asset: input.outputAsset, raw: minOut.toString() },
    fee: { asset: input.input.asset, raw: fee.toString(), bps: O1_FIXTURE_FEE_BPS },
    priceImpactBps: Math.min(impactBps, 10_000),
    expiresAt: new Date(now().getTime() + policy.onchain.quoteTtlSeconds * 1000).toISOString(),
    route: settlementIn ? ["o1-router-replica"] : ["o1-router-replica", "hydrex-origin-path"],
    routeFeeChargedOnce: true,
  };
  return parseO1Quote(payload);
}

class O1ReplicaAdapter implements SpotAdapter {
  readonly capabilities = o1Capabilities;

  async quote(input: QuoteRequest): Promise<ExecutionQuote> {
    if (input.context.chainId !== 31337) {
      throw new UnprocessableEntityException("o1 replica only serves the local testnet", "CAPABILITY_UNAVAILABLE");
    }
    const stock = await db.stock.findUnique({ where: { id: input.stockId } });
    if (!stock?.assetKey) throw new UnprocessableEntityException("Stock has no asset key", "STOCK_UNAVAILABLE");
    const manifest = readManifest();
    const settlement = settlementAssetKey(manifest);
    const stockAsset = stock.assetKey;
    const buy = input.side === "buy";
    const tokenIn = (buy ? parseAssetKey(settlement).address : parseAssetKey(stockAsset).address) as Address;
    const tokenOut = (buy ? parseAssetKey(stockAsset).address : parseAssetKey(settlement).address) as Address;
    const parsed = await localQuoteTransport(input, tokenIn, tokenOut);
    if (parsed.input.asset !== input.input.asset || parsed.input.raw !== input.input.raw) {
      throw new O1ReplicaError("Quote input does not match the request");
    }
    assertFeeConsistency(parsed, input.input.raw);
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
      routeFingerprint: keccak256(encodePacked(["string"], [parsed.route.join(">")])) as string,
    };
  }

  async prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan> {
    if (quote.expiresAt <= now()) {
      throw new O1ReplicaError("Quote expired before prepare");
    }
    if (quote.context.chainId !== 31337 || quote.context.integrationKind !== "local_testnet_replica") {
      throw new O1ReplicaError("Foreign quote context rejected");
    }
    const manifest = readManifest();
    const router = routerAddress();
    const stock = await db.stock.findUnique({ where: { id: quote.stockId } });
    if (!stock?.assetKey) throw new O1ReplicaError("Stock has no asset key");
    const wallet = await db.wallet.findUniqueOrThrow({ where: { id: quote.walletId } });
    const recipient = wallet.executionAddress as Address;
    if (!recipient) throw new O1ReplicaError("Execution account missing");
    const settlement = settlementAssetKey(manifest);
    const buy = quote.input.asset === settlement;
    const tokenIn = (buy ? parseAssetKey(settlement).address : parseAssetKey(stock.assetKey).address) as Address;
    const tokenOut = (buy ? parseAssetKey(stock.assetKey).address : parseAssetKey(settlement).address) as Address;
    const deadline = await chainDeadlineFromNow();
    const swapData = encodeFunctionData({
      abi: o1RouterAbi,
      functionName: "swapExactIn",
      args: [tokenIn, tokenOut, quote.input.raw, quote.minOutput.raw, recipient, BigInt(Math.floor(deadline.getTime() / 1000))],
    });
    const approveData = encodeFunctionData({
      abi: buy ? settlementTokenAbi : stockTokenAbi,
      functionName: "approve",
      args: [router, quote.input.raw],
    });
    // Two-step documented flow: quote, then unsigned transaction construction.
    // The /submit response is parsed as transaction construction, never as a fill.
    const preparedPayload = {
      quoteId: quote.id,
      schemaVersion: O1_SCHEMA_VERSION,
      kind: "unsigned_transaction" as const,
      unsignedTx: {
        chainId: quote.context.chainId,
        to: router,
        data: swapData,
        value: "0",
        nonce: "0",
        gas: "3000000",
        maxFeePerGas: "1000000000",
        maxPriorityFeePerGas: "1000000000",
      },
    };
    const prepared = parseO1Prepared(preparedPayload);
    const calls: PreparedCall[] = [
      { to: tokenIn, data: approveData, value: 0n },
      { to: prepared.unsignedTx.to as Address, data: prepared.unsignedTx.data as Hex, value: 0n },
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

export const o1Replica: SpotAdapter = new O1ReplicaAdapter();
