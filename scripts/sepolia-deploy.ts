import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { computePoolAddress, hydrexPositionManagerABI, POOL_DEPLOYER_ADDRESSES, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES, SWAP_ROUTER_ADDRESSES, Token } from "@hydrexfi/hydrex-sdk";
import { zeroAddress, type Abi, type Address, type Hex } from "viem";

import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
import { BASE_SEPOLIA_CHAIN_ID, parseRpcEndpoint } from "../src/backend/integrations/onchain-policy";
import { settlementTokenAbi, stockTokenAbi } from "../src/backend/services/onchain/abis";
import { chainObject, chainTarget, publicClientOn, relayerOn, walletClientOn } from "../src/backend/services/onchain/chains";
import { algebraPoolAbi, fullRangeTicks, sqrtPriceX96For } from "../src/backend/services/onchain/providers/hydrex/pool";
import { loadArtifact, manifestDir, rpcRequest } from "../src/backend/services/onchain/testnet";
import { sha256Hex } from "../src/utils";

const CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

async function main(): Promise<void> {
  assertBetaRuntime(process.env);
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const relayerKey = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
  if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required");
  if (!relayerKey) throw new Error("BASE_SEPOLIA_RELAYER_PRIVATE_KEY is required (fresh testnet-only key)");
  const endpoint = parseRpcEndpoint(rpcUrl, CHAIN_ID);
  if (endpoint.loopback) throw new Error("BASE_SEPOLIA_RPC_URL must not be loopback");

  const priceMicroUsd = BigInt(argValue("--price-micro-usd", "250000000"));
  if (priceMicroUsd <= 0n) throw new Error("--price-micro-usd must be positive");

  const publicClient = publicClientOn(CHAIN_ID);
  const walletClient = walletClientOn(CHAIN_ID);
  const relayer = relayerOn(CHAIN_ID);

  const reportedChainId = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_chainId");
  if (Number(BigInt(reportedChainId)) !== CHAIN_ID) {
    throw new Error(`RPC at ${endpoint.url} reports chain ${reportedChainId}, expected ${CHAIN_ID}`);
  }

  const hydrex = {
    HydrexPoolDeployer: POOL_DEPLOYER_ADDRESSES[CHAIN_ID] as Address,
    HydrexPositionManager: NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[CHAIN_ID] as Address,
    HydrexSwapRouter: SWAP_ROUTER_ADDRESSES[CHAIN_ID] as Address,
  };
  for (const [name, address] of Object.entries(hydrex)) {
    if (!address) throw new Error(`SDK has no ${name} address for chain ${CHAIN_ID}`);
    const code = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [address, "latest"]);
    if (!code || code === "0x") throw new Error(`${name} at ${address} has no code on ${endpoint.url}; refusing to deploy against an unverified provider`);
  }

  execFileSync("forge", ["build"], { stdio: "inherit" });

  async function deploy(name: string, artifact: string, args: unknown[]): Promise<Address> {
    const { abi, bytecode } = loadArtifact(artifact);
    const hash = await walletClient.deployContract({ account: relayer, chain: chainObject(CHAIN_ID), abi: abi as Abi, bytecode: bytecode as Hex, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: chainTarget(CHAIN_ID).confirmations });
    if (!receipt.contractAddress) throw new Error(`Deployment of ${name} produced no address`);
    console.log(`  deployed ${name} at ${receipt.contractAddress}`);
    return receipt.contractAddress;
  }

  const settlement = await deploy("TestSettlementToken", "TestSettlementToken", ["V3ST Test USDC", "tUSDC", 6]);
  // Equal-value stock amount for 1,000,000 test USDC at the requested price. The
  // existing TestStockToken fixture has a fixed 18 decimals (USDC has 6), so the stock
  // amount is usdc * 10^18 / priceMicroUsd. The constructor mints it to the relayer.
  const STOCK_DECIMALS = 18n;
  const usdcAmount = 1_000_000n * 10n ** 6n;
  const stockAmount = (usdcAmount * 10n ** STOCK_DECIMALS) / priceMicroUsd;
  const stock = await deploy("StockTokenAAPL", "TestStockToken", ["Apple Inc. (test token)", "tAAPL", stockAmount]);

  async function send(label: string, to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<Hex> {
    await publicClient.simulateContract({ account: relayer.address, chain: chainObject(CHAIN_ID), address: to, abi, functionName, args });
    const hash = await walletClient.writeContract({ account: relayer, chain: chainObject(CHAIN_ID), address: to, abi, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: chainTarget(CHAIN_ID).confirmations });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`  ${label}: ${hash}`);
    return hash;
  }

  await send("mint test USDC", settlement, settlementTokenAbi, "mint", [relayer.address, usdcAmount]);

  const usdcToken = new Token(CHAIN_ID, settlement, 6, "tUSDC", "V3ST Test USDC");
  const stockToken = new Token(CHAIN_ID, stock, Number(STOCK_DECIMALS), "tAAPL", "Apple Inc. (test token)");
  const [token0, token1] = usdcToken.sortsBefore(stockToken) ? [usdcToken, stockToken] : [stockToken, usdcToken];
  // Algebra prices are token1 per token0 in raw units: sqrtPriceX96 = sqrt(token1/token0) * 2^96.
  // price-micro-usd is raw USDC per one whole share (10^18 raw stock).
  const usdcIsToken0 = token0.equals(usdcToken);
  const priceNum = usdcIsToken0 ? 10n ** STOCK_DECIMALS : priceMicroUsd; // raw token1
  const priceDen = usdcIsToken0 ? priceMicroUsd : 10n ** STOCK_DECIMALS; // per raw token0
  const sqrtPriceX96 = sqrtPriceX96For(priceNum, priceDen);

  // V3ST creates a base (non-custom) Algebra pool: the custom-deployer argument is the
  // zero address, and its address follows the SDK's computePoolAddress.
  const poolAddress = computePoolAddress({
    tokenA: usdcToken,
    tokenB: stockToken,
    poolDeployer: hydrex.HydrexPoolDeployer,
  }) as Address;

  const pm = hydrex.HydrexPositionManager;
  await send("approve USDC", settlement, settlementTokenAbi, "approve", [pm, usdcAmount]);
  await send("approve tAAPL", stock, stockTokenAbi, "approve", [pm, stockAmount]);
  await send(
    "createAndInitializePoolIfNecessary",
    pm,
    hydrexPositionManagerABI,
    "createAndInitializePoolIfNecessary",
    [token0.address, token1.address, zeroAddress, sqrtPriceX96],
  );

  const code = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [poolAddress, "latest"]);
  if (!code || code === "0x") throw new Error(`Pool ${poolAddress} has no code after initialization`);
  const spacing = await publicClient.readContract({ address: poolAddress, abi: algebraPoolAbi, functionName: "tickSpacing" });
  const { tickLower, tickUpper } = fullRangeTicks(spacing);
  const amount0Desired = usdcIsToken0 ? usdcAmount : stockAmount;
  const amount1Desired = usdcIsToken0 ? stockAmount : usdcAmount;
  await send("seed full-range liquidity", pm, hydrexPositionManagerABI, "mint", [{
    token0: token0.address,
    token1: token1.address,
    deployer: zeroAddress,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: relayer.address,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  }]);

  const genesis = await rpcRequest<{ hash: Hex }>(endpoint.url, CHAIN_ID, "eth_getBlockByNumber", ["0x0", false]);
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const contracts: Record<string, { address: Address; abiHash: string; codeHash?: string }> = {};
  for (const [name, address] of [
    ["TestSettlementToken", settlement],
    ["StockTokenAAPL", stock],
  ] as [string, Address][]) {
    const contractCode = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [address, "latest"]);
    contracts[name] = { address, abiHash: sha256Hex(JSON.stringify(name)).slice(0, 16), codeHash: sha256Hex(contractCode) };
  }
  const external: Record<string, { address: Address; codeHash: string }> = {};
  for (const [name, address] of [...Object.entries(hydrex), ["HydrexPoolAAPL", poolAddress]] as [string, Address][]) {
    const contractCode = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [address, "latest"]);
    external[name] = { address, codeHash: sha256Hex(contractCode) };
  }
  const deploymentId = createHash("sha256")
    .update(JSON.stringify({ genesisHash: genesis.hash, chainId: CHAIN_ID, block: block.hash, contracts: Object.keys(contracts).sort(), external: Object.keys(external).sort() }))
    .digest("hex")
    .slice(0, 24);
  const manifest = {
    networkId: `basesepolia:${CHAIN_ID}`,
    chainId: CHAIN_ID,
    genesisHash: genesis.hash,
    deploymentId,
    label: "Base Sepolia verified provider testnet (Hydrex)",
    integrationKind: "verified_provider_testnet",
    mode: "sandbox",
    rpcUrl: endpoint.url,
    relayerAddress: relayer.address,
    contracts,
    external,
    deploymentBlock: block.number.toString(),
    deploymentBlockHash: block.hash,
    createdAt: new Date().toISOString(),
  };
  const dir = path.join(manifestDir(), "base-sepolia");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`manifest written to ${path.join(dir, "manifest.json")}`);
  console.log(`networkId=${manifest.networkId} deploymentId=${deploymentId} pool=${poolAddress} relayer=${relayer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
