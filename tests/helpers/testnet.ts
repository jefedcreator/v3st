import { type Account, type Address, type Hex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  publicClientFor,
  readManifest,
  relayerAccount,
  rpcRequest,
  testnetRpcUrl,
  walletClientFor,
  type TestnetManifest,
} from "@/backend/services/onchain/testnet";
import { settlementTokenAbi, stockRegistryAbi, stockTokenAbi } from "@/backend/services/onchain/abis";

export type TestnetHandle = {
  url: string;
  manifest: TestnetManifest;
  account: Account;
  settlement: Address;
  registry: Address;
  mine(blocks: number): Promise<void>;
  snapshot(): Promise<string>;
  revert(snapshotId: string): Promise<void>;
  advanceTime(seconds: number): Promise<void>;
  setBalanceWei(address: Address, wei: bigint): Promise<void>;
  mintSettlement(to: Address, amount: bigint): Promise<Hex>;
  deployStockToken(name: string, symbol: string, supply: bigint): Promise<Address>;
  registerStock(input: {
    token: Address;
    assetKey: string;
    symbol: string;
    name: string;
    kind?: string;
    issuer?: string;
    rights?: string;
  }): Promise<Hex>;
  setReferencePrice(key: Hex, priceMicroUsd: bigint, basis: string, asOf: number): Promise<Hex>;
  setTradingFlags(key: Hex, paused: boolean, delisted: boolean, enabled: boolean): Promise<Hex>;
  scheduleMultiplier(token: Address, toWad: bigint, effectiveAt: number): Promise<Hex>;
  cancelAction(token: Address, actionId: bigint): Promise<Hex>;
  applyDueActions(token: Address): Promise<Hex>;
  settlementBalance(address: Address): Promise<bigint>;
  tokenBalance(token: Address, address: Address): Promise<bigint>;
  tokenMultiplier(token: Address): Promise<bigint>;
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  sendTx(input: { to: Address; data: Hex; value?: bigint }): Promise<Hex>;
  receipt(hash: Hex): Promise<{
    status: string;
    blockNumber: bigint;
    blockHash: Hex;
    gasUsed: bigint;
    logs: unknown[];
  }>;
  blockNumber(): Promise<bigint>;
  chainId(): Promise<number>;
};

let cached: TestnetHandle | null = null;

export async function testnet(): Promise<TestnetHandle> {
  if (cached) return cached;
  const url = testnetRpcUrl();
  const manifest = readManifest();
  const chainId = await rpcRequest<Hex>(url, "eth_chainId");
  if (Number(BigInt(chainId)) !== manifest.chainId) {
    throw new Error(`testnet chain id mismatch: rpc=${chainId} manifest=${manifest.chainId}`);
  }
  const account = process.env.TESTNET_SIGNER_PRIVATE_KEY
    ? privateKeyToAccount(process.env.TESTNET_SIGNER_PRIVATE_KEY as Hex)
    : relayerAccount();
  const publicClient = publicClientFor(url);
  const wallet = walletClientFor(account, url);
  const settlement = manifest.contracts.TestSettlementToken?.address;
  const registry = manifest.contracts.TestStockRegistry?.address;
  if (!settlement || !registry) throw new Error("manifest missing core contracts");

  const handle: TestnetHandle = {
    url,
    manifest,
    account,
    settlement,
    registry,
    async mine(blocks) {
      await rpcRequest(url, "evm_mine", [blocks]);
    },
    async snapshot() {
      return rpcRequest<string>(url, "evm_snapshot");
    },
    async revert(snapshotId) {
      await rpcRequest(url, "evm_revert", [snapshotId]);
    },
    async advanceTime(seconds) {
      await rpcRequest(url, "evm_increaseTime", [seconds]);
      await rpcRequest(url, "evm_mine", [1]);
    },
    async setBalanceWei(address, wei) {
      await rpcRequest(url, "anvil_setBalance", [address, `0x${wei.toString(16)}`]);
    },
    async mintSettlement(to, amount) {
      const hash = await wallet.writeContract({
        address: settlement,
        abi: settlementTokenAbi,
        functionName: "mint",
        args: [to, amount],
      });
      return hash;
    },
    async deployStockToken(name, symbol, supply) {
      const artifact = JSON.parse(
        (await import("node:fs")).readFileSync(
          `${process.cwd()}/build/foundry/out/TestStockToken.sol/TestStockToken.json`,
          "utf8",
        ),
      ) as { abi: unknown; bytecode: { object: string } };
      const hash = await wallet.deployContract({
        abi: artifact.abi as never,
        bytecode: `0x${artifact.bytecode.object.replace(/^0x/, "")}` as Hex,
        args: [name, symbol, supply],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error("stock token deployment failed");
      return receipt.contractAddress;
    },
    async registerStock(input) {
      return wallet.writeContract({
        address: registry,
        abi: stockRegistryAbi,
        functionName: "registerInstrument",
        args: [
          input.token,
          input.assetKey,
          input.symbol,
          input.name,
          18,
          input.kind ?? "stock",
          input.issuer ?? "V3ST fixture issuer",
          input.rights ?? "tokenized stock exposure; no voting or redemption rights",
        ],
      });
    },
    async setReferencePrice(key, priceMicroUsd, basis, asOf) {
      return wallet.writeContract({
        address: registry,
        abi: stockRegistryAbi,
        functionName: "setReferencePrice",
        args: [key, priceMicroUsd, basis, BigInt(asOf)],
      });
    },
    async setTradingFlags(key, paused, delisted, enabled) {
      return wallet.writeContract({
        address: registry,
        abi: stockRegistryAbi,
        functionName: "setTradingFlags",
        args: [key, paused, delisted, enabled],
      });
    },
    async scheduleMultiplier(token, toWad, effectiveAt) {
      return wallet.writeContract({
        address: token,
        abi: stockTokenAbi,
        functionName: "scheduleMultiplier",
        args: [toWad, BigInt(effectiveAt)],
      });
    },
    async cancelAction(token, actionId) {
      return wallet.writeContract({
        address: token,
        abi: stockTokenAbi,
        functionName: "cancelAction",
        args: [actionId],
      });
    },
    async applyDueActions(token) {
      return wallet.writeContract({ address: token, abi: stockTokenAbi, functionName: "applyDueActions" });
    },
    async settlementBalance(address) {
      return publicClient.readContract({
        address: settlement,
        abi: settlementTokenAbi,
        functionName: "balanceOf",
        args: [address],
      }) as Promise<bigint>;
    },
    async tokenBalance(token, address) {
      return publicClient.readContract({
        address: token,
        abi: stockTokenAbi,
        functionName: "balanceOf",
        args: [address],
      }) as Promise<bigint>;
    },
    async tokenMultiplier(token) {
      return publicClient.readContract({
        address: token,
        abi: stockTokenAbi,
        functionName: "multiplierWad",
      }) as Promise<bigint>;
    },
    async allowance(token, owner, spender) {
      return publicClient.readContract({
        address: token,
        abi: stockTokenAbi,
        functionName: "allowance",
        args: [owner, spender],
      }) as Promise<bigint>;
    },
    async sendTx(input) {
      return wallet.sendTransaction({ to: input.to, data: input.data, value: input.value ?? 0n });
    },
    async receipt(hash) {
      const r = await publicClient.getTransactionReceipt({ hash });
      return {
        status: r.status,
        blockNumber: r.blockNumber,
        blockHash: r.blockHash,
        gasUsed: r.gasUsed,
        logs: r.logs,
      };
    },
    async blockNumber() {
      return publicClient.getBlockNumber();
    },
    async chainId() {
      return Number(await publicClient.getChainId());
    },
  };
  cached = handle;
  return handle;
}

export const executionAccountAbi = parseAbi([
  "function owner() view returns (address)",
  "function relayer() view returns (address)",
]);

let networkRow: { id: string } | null = null;

export async function ensureTestnetNetwork(): Promise<{ id: string }> {
  if (networkRow) return networkRow;
  const { db } = await import("@/server/db");
  const handle = await testnet();
  const existing = await db.onchainNetwork.findUnique({
    where: { deploymentId: handle.manifest.deploymentId },
  });
  if (existing) {
    networkRow = { id: existing.id };
    return networkRow;
  }
  const created = await db.onchainNetwork.create({
    data: {
      networkId: handle.manifest.networkId,
      chainId: handle.manifest.chainId,
      kind: "local_testnet_replica",
      genesisHash: handle.manifest.genesisHash,
      deploymentId: handle.manifest.deploymentId,
      label: handle.manifest.label,
      rpcLoopback: true,
    },
  });
  networkRow = { id: created.id };
  return networkRow;
}

export async function makeTestnetStock(input: {
  symbol: string;
  name?: string;
  supply?: bigint;
  referencePriceMicroUsd?: bigint;
  referenceBasis?: string;
}): Promise<{ stock: import("@/server/prisma").Stock; token: Address; registryKey: Hex }> {
  const { db } = await import("@/server/db");
  const { stockAssetKey } = await import("@/backend/services/onchain/testnet");
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const supply = input.supply ?? 1_000_000n * 10n ** 18n;
  const token = await handle.deployStockToken(input.name ?? `Test ${input.symbol}`, input.symbol, supply);
  const assetKeyValue = stockAssetKey(handle.manifest, token);
  const registryKey = await handle.registerStock({
    token,
    assetKey: assetKeyValue,
    symbol: input.symbol,
    name: input.name ?? `Test ${input.symbol}`,
  });
  if (input.referencePriceMicroUsd !== undefined) {
    await handle.setReferencePrice(
      registryKey,
      input.referencePriceMicroUsd,
      input.referenceBasis ?? "share_price",
      Math.floor(Date.now() / 1000),
    );
  }
  const stock = await db.stock.create({
    data: {
      symbol: input.symbol,
      assetKey: assetKeyValue,
      name: input.name ?? `Test ${input.symbol}`,
      chain: "testnet",
      networkId: network.id,
      tokenAddress: token,
      decimals: 18,
      enabled: true,
      simPriceMicroUsdc: input.referencePriceMicroUsd ?? 2_000_000n,
      simWeeklyEarningMicroPerShare: 0n,
      referencePriceMicroUsd: input.referencePriceMicroUsd ?? null,
      referenceBasis: input.referencePriceMicroUsd === undefined ? null : (input.referenceBasis ?? "share_price"),
      referenceAsOf: input.referencePriceMicroUsd === undefined ? null : new Date(),
      provenance: {
        integration_kind: "local_testnet_replica",
        network_id: handle.manifest.networkId,
        deployment_id: handle.manifest.deploymentId,
        registry: handle.registry,
        registry_key: registryKey,
      },
    },
  });
  return { stock, token, registryKey };
}
