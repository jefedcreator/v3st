import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hydrexPositionManagerABI, hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { decodeFunctionData, encodeAbiParameters, erc20Abi, type Address } from "viem";
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";

import { __setRpcTransportForTests } from "@/backend/services/onchain/chains";
import { manifestDir } from "@/backend/services/onchain/testnet";
import { HYDREX_ACTUAL_VERSION, __setPoolReaderForTests } from "@/backend/services/onchain/providers/hydrex/actual";
import {
  hydrexActualSpot,
  hydrexActualStrategy,
} from "@/backend/services/onchain/providers/hydrex/actual";
import type { PoolState } from "@/backend/services/onchain/providers/hydrex/pool";
import type { QuoteRequest, StrategyRequest } from "@/backend/services/onchain/types";
import { db } from "@/server/db";

import { useTestDatabase } from "../../helpers/db";
import { makeUserWithWallets } from "../../helpers/factories";

useTestDatabase();

const USDC = "0x0000000000000000000000000000000000000a01" as Address;
const STOCK = "0x0000000000000000000000000000000000000a02" as Address;
const POOL = "0x0000000000000000000000000000000000000b01" as Address;
const ROUTER = "0x10Dcb20d06fbC1461D21D6b31E54042D656C67FC" as Address;
const PM = "0xb7875b8Dc8f49c2D6BBb658905dBF88843B54Da8" as Address;
const ACCOUNT = "0x0000000000000000000000000000000000000c01" as Address;
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

function sepoliaContext(chainId = 84532): QuoteRequest["context"] {
  return {
    stage: "beta",
    mode: "sandbox",
    integrationKind: "verified_provider_testnet",
    networkId: "basesepolia:84532",
    chainId,
    deploymentId: DEPLOYMENT_ID,
    providerId: "hydrex",
    providerVersion: HYDREX_ACTUAL_VERSION,
    custodyProfileId: "custody-sepolia-1",
  };
}

function buyRequest(opts?: { chainId?: number; inputRaw?: bigint; slippageBps?: number }): QuoteRequest {
  return {
    userId: user.id,
    walletId,
    stockId: "stock-tAAPL",
    side: "buy",
    input: { asset: `basesepolia:84532:${USDC}`, raw: opts?.inputRaw ?? 1_000_000n },
    outputAsset: `basesepolia:84532:${STOCK}`,
    slippageBps: opts?.slippageBps ?? 50,
    context: sepoliaContext(opts?.chainId ?? 84532),
  };
}

function fakeBlock() {
  const timestamp = Math.floor(Date.now() / 1000);
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
    timestamp: `0x${timestamp.toString(16)}`,
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
        HydrexPoolDeployer: { address: "0x9cb57c3E31D50fa5c273eC0a5A51cF9cb3B127A7", codeHash: "cc" },
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
      // positions(tokenId) read for exit quotes: liquidity at output index 7.
      return encodeAbiParameters(
        [
          { type: "uint88" },
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "int24" },
          { type: "int24" },
          { type: "uint128" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint128" },
          { type: "uint128" },
        ],
        [0n, ACCOUNT, USDC, STOCK, PM, -887_220, 887_220, 123_456n, 0n, 0n, 0n, 0n],
      );
    }
    throw new Error(`unexpected rpc ${method}`);
  });
});

beforeEach(async () => {
  const u = await makeUserWithWallets();
  user = u;
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId_family: { userId: u.id, family: "evm" } } });
  walletId = wallet.id;
  await db.executionAccount.create({
    data: {
      walletId: wallet.id,
      chainId: 84532,
      deploymentId: DEPLOYMENT_ID,
      address: ACCOUNT,
      custodyProfileId: "custody-sepolia-1",
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
      provenance: {
        kind: "hydrex_nft",
        chainId: 84532,
        pool: POOL,
        positionManager: PM,
        stockId: "stock-tAAPL",
      },
    },
  });
  await db.strategyPosition.create({
    data: {
      id: "pos-42",
      userId: u.id,
      strategyId: "strat-hydrex-sepolia",
      state: "active",
      externalTokenId: "42",
    },
  });
});

const usdcAsset = `basesepolia:84532:${USDC}`;
const stockAsset = `basesepolia:84532:${STOCK}`;

function strategyRequest(action: "enter" | "claim" | "exit", inputs: { usdc: bigint; stock: bigint }): StrategyRequest {
  return {
    userId: user.id,
    strategyId: "strat-hydrex-sepolia",
    positionId: action === "enter" ? null : "pos-42",
    action,
    inputs: [
      { asset: usdcAsset, raw: inputs.usdc },
      { asset: stockAsset, raw: inputs.stock },
    ],
    context: sepoliaContext(),
  };
}

afterAll(() => {
  __setPoolReaderForTests(async () => poolState);
  __setRpcTransportForTests(null);
  delete process.env.BASE_SEPOLIA_RPC_URL;
});

describe("hydrex actual spot adapter", () => {
  it("prepares an exact approve plus exactInputSingle to the Hydrex router", async () => {
    const quote = await hydrexActualSpot.quote(buyRequest({ inputRaw: 1_000_000n, slippageBps: 50 }));
    expect(quote.minOutput.raw).toBe((quote.expectedOutput.raw * 9_950n) / 10_000n);
    const plan = await hydrexActualSpot.prepare(quote, `op-${randomUUID()}`);
    expect(plan.calls).toHaveLength(2);
    expect(plan.calls[0]!.to.toLowerCase()).toBe(USDC);
    const approve = decodeFunctionData({ abi: erc20Abi, data: plan.calls[0]!.data });
    expect(approve.args).toEqual([ROUTER, 1_000_000n]);
    const swap = decodeFunctionData({ abi: hydrexSwapRouterABI, data: plan.calls[1]!.data });
    expect(swap.functionName).toBe("exactInputSingle");
    const swapParams = swap.args![0] as Record<string, unknown>;
    expect(String(swapParams.recipient).toLowerCase()).toBe(ACCOUNT);
    expect(swapParams).toMatchObject({
      tokenIn: USDC,
      tokenOut: STOCK,
      amountIn: 1_000_000n,
      amountOutMinimum: quote.minOutput.raw,
      limitSqrtPrice: 0n,
    });
    expect(plan.calls.every((c) => c.value === 0n)).toBe(true);
  });

  it("refuses a context that is not Base Sepolia verified testnet", async () => {
    await expect(hydrexActualSpot.quote(buyRequest({ chainId: 31337 }))).rejects.toThrow();
  });

  it("refuses when price impact exceeds policy", async () => {
    await expect(hydrexActualSpot.quote(buyRequest({ inputRaw: 10n ** 12n }))).rejects.toThrow(/price impact/i);
  });
});

describe("hydrex actual strategy adapter", () => {
  it("enter mints a full-range position owned by the execution account", async () => {
    const quote = await hydrexActualStrategy.quote(strategyRequest("enter", { usdc: 1_000_000n, stock: 4_000n }));
    const plan = await hydrexActualStrategy.prepare(quote, `op-${randomUUID()}`);
    expect(plan.calls.map((c) => c.to.toLowerCase())).toEqual([USDC, STOCK, PM.toLowerCase()]);
    const mint = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[2]!.data });
    expect(mint.functionName).toBe("mint");
    const mintParams = mint.args![0] as Record<string, unknown>;
    expect(String(mintParams.recipient).toLowerCase()).toBe(ACCOUNT);
    expect(mintParams.tickLower).toBe(-887_220);
    expect(mintParams.tickUpper).toBe(887_220);
  });

  it("claim collects to the execution account for the stored token id", async () => {
    const quote = await hydrexActualStrategy.quote(strategyRequest("claim", { usdc: 0n, stock: 0n }));
    const plan = await hydrexActualStrategy.prepare(quote, `op-${randomUUID()}`);
    expect(plan.calls).toHaveLength(1);
    const collect = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[0]!.data });
    expect(collect.functionName).toBe("collect");
    const collectParams = collect.args![0] as Record<string, unknown>;
    expect(collectParams.tokenId).toBe(42n);
    expect(String(collectParams.recipient).toLowerCase()).toBe(ACCOUNT);
  });

  it("exit decreases all liquidity then collects, with minimums from the quote", async () => {
    const quote = await hydrexActualStrategy.quote(strategyRequest("exit", { usdc: 1_000_000n, stock: 4_000n }));
    const plan = await hydrexActualStrategy.prepare(quote, `op-${randomUUID()}`);
    const names = plan.calls.map(
      (c) => decodeFunctionData({ abi: hydrexPositionManagerABI, data: c.data }).functionName,
    );
    expect(names).toEqual(["decreaseLiquidity", "collect"]);
    const decrease = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[0]!.data });
    const decreaseParams = decrease.args![0] as Record<string, unknown>;
    expect(decreaseParams.tokenId).toBe(42n);
    expect(decreaseParams.liquidity).toBe(123_456n);
  });
});
