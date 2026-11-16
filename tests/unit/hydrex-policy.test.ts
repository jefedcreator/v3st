import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hydrexPositionManagerABI, hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, erc20Abi, zeroAddress, type Abi, type Address, type Hex } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { __setRpcTransportForTests } from "@/backend/services/onchain/chains";
import { manifestDir } from "@/backend/services/onchain/testnet";
import {
  HYDREX_ACTUAL_VERSION,
  __setPoolReaderForTests,
  hydrexActualSpot,
  hydrexActualStrategy,
} from "@/backend/services/onchain/providers/hydrex/actual";
import type { PoolState } from "@/backend/services/onchain/providers/hydrex/pool";
import { pack } from "@/backend/services/execution";
import { assertExecutionPlan, ExecutionPlanRejected } from "@/backend/services/execution/policy";
import type { ExecutionPlan, QuoteRequest, StrategyPlan, StrategyRequest } from "@/backend/services/onchain/types";
import type { Prisma } from "@/server/prisma";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";

useTestDatabase();

const USDC = "0x0000000000000000000000000000000000000a01" as Address;
const STOCK = "0x0000000000000000000000000000000000000a02" as Address;
const POOL = "0x0000000000000000000000000000000000000b01" as Address;
const ROUTER = "0x10Dcb20d06fbC1461D21D6b31E54042D656C67FC" as Address;
const PM = "0xb7875b8Dc8f49c2D6BBb658905dBF88843B54Da8" as Address;
const DEPLOYER = "0x9cb57c3E31D50fa5c273eC0a5A51cF9cb3B127A7" as Address;
const ACCOUNT = "0x0000000000000000000000000000000000000c01" as Address;
const ATTACKER = "0x000000000000000000000000000000000000dEaD" as Address;
const OTHER_TOKEN = "0x0000000000000000000000000000000000000e01" as Address;
const DEPLOYMENT_ID = "dep-sepolia-fixture";

const poolState: PoolState = {
  address: POOL,
  token0: USDC,
  token1: STOCK,
  sqrtPriceX96: 2n ** 96n,
  tick: 0,
  feePips: 3000,
  liquidity: 1_000_000_000n,
  tickSpacing: 60,
};

let user: { id: string };
let walletId: string;
let spotOpId: string;
let strategyOpId: string;

function sepoliaContext(): QuoteRequest["context"] {
  return {
    stage: "beta",
    mode: "sandbox",
    integrationKind: "verified_provider_testnet",
    networkId: "basesepolia:84532",
    chainId: 84532,
    deploymentId: DEPLOYMENT_ID,
    providerId: "hydrex",
    providerVersion: HYDREX_ACTUAL_VERSION,
    custodyProfileId: "custody-sepolia-1",
  };
}

function buyRequest(): QuoteRequest {
  return {
    userId: user.id,
    walletId,
    stockId: "stock-tAAPL",
    side: "buy",
    input: { asset: `basesepolia:84532:${USDC}`, raw: 1_000_000n },
    outputAsset: `basesepolia:84532:${STOCK}`,
    slippageBps: 50,
    context: sepoliaContext(),
  };
}

function strategyRequest(action: "enter" | "claim" | "exit"): StrategyRequest {
  return {
    userId: user.id,
    strategyId: "strat-hydrex-sepolia",
    positionId: action === "enter" ? null : "pos-42",
    action,
    inputs: [
      { asset: `basesepolia:84532:${USDC}`, raw: 1_000_000n },
      { asset: `basesepolia:84532:${STOCK}`, raw: 4_000n },
    ],
    context: sepoliaContext(),
  };
}

function fakeBlock() {
  return {
    number: "0x100",
    hash: `0x${"22".repeat(32)}`,
    parentHash: `0x${"11".repeat(32)}`,
    nonce: "0x0000000000000000",
    sha3Uncles: `0x${"00".repeat(32)}`,
    logsBloom: `0x${"00".repeat(256)}`,
    transactionsRoot: `0x${"00".repeat(32)}`,
    stateRoot: `0x${"00".repeat(32)}`,
    receiptsRoot: `0x${"00".repeat(32)}`,
    miner: "0x0000000000000000000000000000000000000000",
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x1000",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x1",
    mixHash: `0x${"00".repeat(32)}`,
  };
}

beforeAll(async () => {
  process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
  const dir = path.join(manifestDir(), "base-sepolia");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      networkId: "basesepolia:84532",
      chainId: 84532,
      genesisHash: `0x${"00".repeat(32)}`,
      deploymentId: DEPLOYMENT_ID,
      label: "fixture",
      integrationKind: "verified_provider_testnet",
      mode: "sandbox",
      rpcUrl: "https://sepolia.base.org",
      relayerAddress: ACCOUNT,
      contracts: {
        TestSettlementToken: { address: USDC, abiHash: "00", codeHash: "aa" },
        StockTokenAAPL: { address: STOCK, abiHash: "00", codeHash: "bb" },
      },
      external: {
        HydrexPoolDeployer: { address: DEPLOYER, codeHash: "cc" },
        HydrexPositionManager: { address: PM, codeHash: "dd" },
        HydrexSwapRouter: { address: ROUTER, codeHash: "ee" },
        HydrexPoolAAPL: { address: POOL, codeHash: "ff" },
      },
      createdAt: new Date().toISOString(),
    }),
  );
  __setPoolReaderForTests(async () => poolState);
  __setRpcTransportForTests(async (_url, _chainId, method) => {
    if (method === "eth_chainId") return "0x14a34";
    if (method === "eth_blockNumber") return "0x100";
    if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") return fakeBlock();
    if (method === "eth_call") {
      return encodeAbiParameters(
        [
          { type: "uint88" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" },
          { type: "int24" }, { type: "int24" }, { type: "uint128" }, { type: "uint256" }, { type: "uint256" },
          { type: "uint128" }, { type: "uint128" },
        ],
        [0n, ACCOUNT, USDC, STOCK, PM, -887_220, 887_220, 123_456n, 0n, 0n, 0n, 0n],
      );
    }
    throw new Error(`unexpected rpc ${method}`);
  });
});

afterAll(() => {
  __setRpcTransportForTests(null);
  delete process.env.BASE_SEPOLIA_RPC_URL;
});

beforeEach(async () => {
  const u = await makeUserWithWallets();
  user = u;
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId_family: { userId: u.id, family: "evm" } } });
  walletId = wallet.id;
  const profile = await db.custodyProfile.create({
    data: { id: "custody-sepolia-1", kind: "application_account", label: "sepolia fixture", walletId: wallet.id, deploymentId: DEPLOYMENT_ID },
  });
  await db.executionAccount.create({
    data: { walletId: wallet.id, chainId: 84532, deploymentId: DEPLOYMENT_ID, address: ACCOUNT, custodyProfileId: profile.id },
  });
  const network = await db.onchainNetwork.create({
    data: {
      networkId: "basesepolia:84532",
      chainId: 84532,
      kind: "verified_provider_testnet",
      deploymentId: DEPLOYMENT_ID,
      label: "fixture",
      rpcLoopback: false,
    },
  });
  await db.strategy.create({
    data: {
      id: "strat-hydrex-sepolia",
      providerId: "hydrex",
      key: "hydrex-aapl-usdc-basesepolia",
      name: "Hydrex AAPL/USDC LP (Base Sepolia)",
      version: "1.0.0",
      disclosureVersion: "1.0.0",
      inputAssets: [],
      receiptAsset: "receipt",
      rewardAssets: [],
      separateClaim: true,
      maxUsdEquivalent: "1000000000000",
      provenance: { kind: "hydrex_nft", chainId: 84532, pool: POOL, positionManager: PM, stockId: "stock-tAAPL" },
    },
  });
  await db.strategyPosition.create({
    data: { id: "pos-42", userId: u.id, strategyId: "strat-hydrex-sepolia", state: "active", externalTokenId: "42" },
  });
  const base = {
    requestHash: "hash",
    userId: u.id,
    walletId: wallet.id,
    custodyProfileId: profile.id,
    networkId: network.id,
    providerId: "hydrex",
    fingerprint: "fp",
  };
  const spotOp = await db.onchainOperation.create({
    data: {
      ...base,
      key: `op-${randomUUID()}`,
      kind: "spot",
      expected: pack({ quote: { id: "q", request: undefined }, recipient: ACCOUNT }) as Prisma.InputJsonValue,
    },
  });
  spotOpId = spotOp.id;
  const strategyOp = await db.onchainOperation.create({
    data: {
      ...base,
      key: `op-${randomUUID()}`,
      kind: "strategy",
      expected: pack({
        quote: { request: { strategyId: "strat-hydrex-sepolia", action: "claim", positionId: "pos-42", inputs: [] } },
        recipient: ACCOUNT,
      }) as Prisma.InputJsonValue,
    },
  });
  strategyOpId = strategyOp.id;
});

async function swapPlanWith(mutate?: (a: Record<string, unknown>) => Record<string, unknown>): Promise<ExecutionPlan> {
  const quote = await hydrexActualSpot.quote(buyRequest());
  const plan = await hydrexActualSpot.prepare(quote, spotOpId);
  if (mutate) {
    const decoded = decodeFunctionData({ abi: hydrexSwapRouterABI, data: plan.calls[1]!.data });
    const params = mutate(decoded.args[0] as Record<string, unknown>);
    plan.calls[1] = {
      to: plan.calls[1]!.to,
      data: encodeFunctionData({ abi: hydrexSwapRouterABI, functionName: "exactInputSingle", args: [params as never] }),
      value: 0n,
    };
  }
  return plan;
}

async function mintPlanWith(mutate?: (a: Record<string, unknown>) => Record<string, unknown>): Promise<StrategyPlan> {
  const quote = await hydrexActualStrategy.quote(strategyRequest("enter"));
  const plan = await hydrexActualStrategy.prepare(quote, strategyOpId);
  if (mutate) {
    const index = plan.calls.findIndex((c) => c.to.toLowerCase() === PM.toLowerCase());
    const decoded = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[index]!.data });
    const params = mutate(decoded.args[0] as Record<string, unknown>);
    plan.calls[index] = {
      to: PM,
      data: encodeFunctionData({ abi: hydrexPositionManagerABI, functionName: "mint", args: [params as never] }),
      value: 0n,
    };
  }
  return plan;
}

async function claimPlan(planTokenId: bigint): Promise<StrategyPlan> {
  const quote = await hydrexActualStrategy.quote(strategyRequest("claim"));
  const plan = await hydrexActualStrategy.prepare(quote, strategyOpId);
  const decoded = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[0]!.data });
  const params = { ...(decoded.args[0] as Record<string, unknown>), tokenId: planTokenId };
  plan.calls[0] = {
    to: PM,
    data: encodeFunctionData({ abi: hydrexPositionManagerABI, functionName: "collect", args: [params as never] }),
    value: 0n,
  };
  return plan;
}

async function exitPlan(): Promise<StrategyPlan> {
  const quote = await hydrexActualStrategy.quote(strategyRequest("exit"));
  return hydrexActualStrategy.prepare(quote, strategyOpId);
}

async function planWithRawCall(to: Address, fn: string): Promise<StrategyPlan> {
  const plan = await claimPlan(42n);
  const rawArgs: Record<string, unknown[]> = {
    multicall: [["0x"]],
    selfPermit: [USDC, 1n, 1n, 27, `0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`],
    approveForFarming: [42n, true, ATTACKER],
    burn: [42n],
    safeTransferFrom: [ACCOUNT, ATTACKER, 42n],
  };
  const abi: Abi = fn === "multicall" || fn === "selfPermit" ? hydrexSwapRouterABI : hydrexPositionManagerABI;
  plan.calls[0] = { to, data: encodeFunctionData({ abi, functionName: fn, args: rawArgs[fn]! }), value: 0n };
  return plan;
}

describe("hydrex execution policy", () => {
  it.each([
    ["recipient", (a: Record<string, unknown>) => ({ ...a, recipient: ATTACKER })],
    ["tokenOut", (a: Record<string, unknown>) => ({ ...a, tokenOut: OTHER_TOKEN })],
    ["amountIn", (a: Record<string, unknown>) => ({ ...a, amountIn: (a.amountIn as bigint) + 1n })],
    ["amountOutMinimum", (a: Record<string, unknown>) => ({ ...a, amountOutMinimum: (a.amountOutMinimum as bigint) - 1n })],
    ["deployer", (a: Record<string, unknown>) => ({ ...a, deployer: ATTACKER })],
  ])("rejects a swap whose %s differs from the accepted quote", async (_name, mutate) => {
    await expect(assertExecutionPlan(await swapPlanWith(mutate))).rejects.toThrow(ExecutionPlanRejected);
  });

  it("rejects multicall, permits and farming calls on Hydrex contracts", async () => {
    for (const fn of ["multicall", "selfPermit", "approveForFarming", "burn", "safeTransferFrom"]) {
      await expect(assertExecutionPlan(await planWithRawCall(PM, fn))).rejects.toThrow(ExecutionPlanRejected);
    }
  });

  it("rejects collect or decreaseLiquidity for a token id the position does not own", async () => {
    await expect(assertExecutionPlan(await claimPlan(43n))).rejects.toThrow(/token id/i);
  });

  it("rejects mint ticks that are not full range and recipients other than the account", async () => {
    await expect(assertExecutionPlan(await mintPlanWith((a) => ({ ...a, tickLower: -60 })))).rejects.toThrow();
    await expect(assertExecutionPlan(await mintPlanWith((a) => ({ ...a, recipient: ATTACKER })))).rejects.toThrow();
  });

  it("accepts the unmodified swap, mint, collect and exit plans", async () => {
    for (const plan of [
      await swapPlanWith((a) => a),
      await mintPlanWith((a) => a),
      await claimPlan(42n),
      await exitPlan(),
    ]) {
      await expect(assertExecutionPlan(plan)).resolves.toBeUndefined();
    }
  });
});
