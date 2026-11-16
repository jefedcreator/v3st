import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { decodeFunctionData, erc20Abi, type Address } from "viem";
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";

import { __setRpcTransportForTests } from "@/backend/services/onchain/chains";
import { manifestDir } from "@/backend/services/onchain/testnet";
import {
  HYDREX_ACTUAL_VERSION,
  __setPoolReaderForTests,
  hydrexActualSpot,
} from "@/backend/services/onchain/providers/hydrex/actual";
import type { PoolState } from "@/backend/services/onchain/providers/hydrex/pool";
import type { QuoteRequest } from "@/backend/services/onchain/types";
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
});

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
