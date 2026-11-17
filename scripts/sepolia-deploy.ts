import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { computePoolAddress, hydrexPositionManagerABI, POOL_DEPLOYER_ADDRESSES, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES, SWAP_ROUTER_ADDRESSES, Token } from "@hydrexfi/hydrex-sdk";
import { zeroAddress, type Abi, type Address, type Hex } from "viem";

import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
import { BASE_SEPOLIA_CHAIN_ID, parseRpcEndpoint } from "../src/backend/integrations/onchain-policy";
import { settlementTokenAbi, stockTokenAbi } from "../src/backend/services/onchain/abis";
import { chainObject, chainTarget, keeperOn, publicClientOn, relayerOn, walletClientOn } from "../src/backend/services/onchain/chains";
import { type NetworkManifest, manifestPathFor } from "../src/backend/services/onchain/manifests";
import { algebraPoolAbi, fullRangeTicks, sqrtPriceX96For } from "../src/backend/services/onchain/providers/hydrex/pool";
import { stockReference } from "../src/backend/services/stocks/reference";
import { fetchStocksPage } from "../src/backend/services/stocks/base-stocks-client";
import { loadArtifact, manifestDir, rpcRequest } from "../src/backend/services/onchain/testnet";
import { sha256Hex } from "../src/utils";

const CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;
const STOCK_DECIMALS = 18n;

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

  const tickers = argValue("--tickers", "AAPL,NVDA,TSLA,MSFT,AMZN,GOOGL,META,SPCX").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const liquidityMicroUsd = BigInt(argValue("--liquidity-micro-usd", "50000000000"));
  if (liquidityMicroUsd <= 0n) throw new Error("--liquidity-micro-usd must be positive");
  const keeperMultiple = BigInt(argValue("--keeper-multiple", "2"));

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

  async function send(label: string, to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<Hex> {
    await publicClient.simulateContract({ account: relayer.address, chain: chainObject(CHAIN_ID), address: to, abi, functionName, args });
    const hash = await walletClient.writeContract({ account: relayer, chain: chainObject(CHAIN_ID), address: to, abi, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: chainTarget(CHAIN_ID).confirmations });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`  ${label}: ${hash}`);
    return hash;
  }

  const settlement = await deploy("TestSettlementToken", "TestSettlementToken", ["V3ST Test USDC", "tUSDC", 6]);
  await send("mint test USDC", settlement, settlementTokenAbi, "mint", [relayer.address, liquidityMicroUsd * BigInt(tickers.length) * (keeperMultiple + 1n)]);

  // Live NAV per ticker from the tokenized-stocks feed (`${T}c` rows).
  const navByTicker = new Map<string, { navMicroUsd: bigint; name: string; symbol: string }>();
  let next: string | null = null;
  do {
    const page = stockReference.parseLive(await fetchStocksPage(next));
    for (const token of page.stocks) {
      const base = token.symbol.replace(/c$/, "");
      if (tickers.includes(base) && !navByTicker.has(base)) {
        if (token.referencePriceMicroUsd !== null) {
          navByTicker.set(base, { navMicroUsd: token.referencePriceMicroUsd, name: token.name, symbol: token.symbol });
        }
      }
    }
    next = page.next;
  } while (next !== null);

  // The previously deployed manifest's legacy AAPL entries stay valid.
  const manifestFile = manifestPathFor(CHAIN_ID);
  const previousManifest = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, "utf8")) as NetworkManifest)
    : null;

  const usdcToken = new Token(CHAIN_ID, settlement, 6, "tUSDC", "V3ST Test USDC");
  const pm = hydrex.HydrexPositionManager;
  const contracts: Record<string, { address: Address; abiHash: string; codeHash?: string }> = {
    TestSettlementToken: { address: settlement, abiHash: sha256Hex("TestSettlementToken").slice(0, 16) },
  };
  const external: Record<string, { address: Address; codeHash: string }> = {};
  for (const [name, address] of Object.entries(hydrex)) {
    const code = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [address, "latest"]);
    external[name] = { address, codeHash: sha256Hex(code) };
  }
  if (previousManifest?.contracts.StockTokenAAPL) {
    contracts.StockTokenAAPL = previousManifest.contracts.StockTokenAAPL;
  }
  if (previousManifest?.external.HydrexPoolAAPL) {
    external.HydrexPoolAAPL = previousManifest.external.HydrexPoolAAPL;
  }

  const keeperAddress = process.env.BASE_SEPOLIA_KEEPER_PRIVATE_KEY ? keeperOn(CHAIN_ID).address : null;

  for (const ticker of tickers) {
    const nav = navByTicker.get(ticker);
    if (!nav) {
      console.log(`skipped ${ticker}: no live price`);
      continue;
    }
    const entryName = `StockToken_${ticker}`;
    if (previousManifest?.contracts[entryName]) {
      console.log(`skipped ${ticker}: ${entryName} already in the manifest`);
      continue;
    }
    // Stock seed worth `liquidity` at the NAV, plus the keeper's multiple.
    const stockSeed = (liquidityMicroUsd * 10n ** STOCK_DECIMALS) / nav.navMicroUsd;
    const stock = await deploy(entryName, "TestStockToken", [`${nav.name} (test token)`, `t${ticker}`, stockSeed * (1n + keeperMultiple)]);
    const stockToken = new Token(CHAIN_ID, stock, Number(STOCK_DECIMALS), `t${ticker}`, `${nav.name} (test token)`);
    const [token0, token1] = usdcToken.sortsBefore(stockToken) ? [usdcToken, stockToken] : [stockToken, usdcToken];
    // Algebra prices are token1 per token0 in raw units: sqrtPriceX96 = sqrt(token1/token0) * 2^96.
    // The NAV is raw USDC (micro-USD) per one whole share (10^18 raw stock).
    const usdcIsToken0 = token0.equals(usdcToken);
    const priceNum = usdcIsToken0 ? 10n ** STOCK_DECIMALS : nav.navMicroUsd;
    const priceDen = usdcIsToken0 ? nav.navMicroUsd : 10n ** STOCK_DECIMALS;
    const sqrtPriceX96 = sqrtPriceX96For(priceNum, priceDen);

    const poolAddress = computePoolAddress({
      tokenA: usdcToken,
      tokenB: stockToken,
      poolDeployer: hydrex.HydrexPoolDeployer,
    }) as Address;

    await send(`approve USDC ${ticker}`, settlement, settlementTokenAbi, "approve", [pm, liquidityMicroUsd]);
    await send(`approve t${ticker}`, stock, stockTokenAbi, "approve", [pm, stockSeed]);
    await send(
      `createAndInitializePoolIfNecessary ${ticker}`,
      pm,
      hydrexPositionManagerABI,
      "createAndInitializePoolIfNecessary",
      [token0.address, token1.address, zeroAddress, sqrtPriceX96],
    );
    const poolCode = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [poolAddress, "latest"]);
    if (!poolCode || poolCode === "0x") throw new Error(`Pool ${poolAddress} for ${ticker} has no code after initialization`);
    const spacing = await publicClient.readContract({ address: poolAddress, abi: algebraPoolAbi, functionName: "tickSpacing" });
    const { tickLower, tickUpper } = fullRangeTicks(spacing);
    const amount0Desired = usdcIsToken0 ? liquidityMicroUsd : stockSeed;
    const amount1Desired = usdcIsToken0 ? stockSeed : liquidityMicroUsd;
    await send(`seed full-range liquidity ${ticker}`, pm, hydrexPositionManagerABI, "mint", [{
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

    // Fund the keeper with stock and test USDC for alignment trades.
    if (keeperAddress) {
      await send(`keeper stock ${ticker}`, stock, stockTokenAbi, "transfer", [keeperAddress, stockSeed * keeperMultiple]);
      await send(`keeper USDC ${ticker}`, settlement, settlementTokenAbi, "transfer", [keeperAddress, liquidityMicroUsd * keeperMultiple]);
    }

    const stockCode = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [stock, "latest"]);
    contracts[entryName] = { address: stock, abiHash: sha256Hex(entryName).slice(0, 16), codeHash: sha256Hex(stockCode) };
    external[`HydrexPool_${ticker}`] = { address: poolAddress, codeHash: sha256Hex(poolCode) };
    console.log(`  ${ticker}: token ${stock} pool ${poolAddress} nav ${nav.navMicroUsd}`);
  }

  if (!keeperAddress) {
    console.log("note: BASE_SEPOLIA_KEEPER_PRIVATE_KEY is not set; the keeper was not funded");
  }

  const genesis = await rpcRequest<{ hash: Hex }>(endpoint.url, CHAIN_ID, "eth_getBlockByNumber", ["0x0", false]);
  const block = await publicClient.getBlock({ blockTag: "latest" });
  for (const [name, address] of [["TestSettlementToken", settlement] as [string, Address]]) {
    const contractCode = await rpcRequest<Hex>(endpoint.url, CHAIN_ID, "eth_getCode", [address, "latest"]);
    contracts[name]!.codeHash = sha256Hex(contractCode);
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
    catalogVersion: 2,
    deploymentBlock: block.number.toString(),
    deploymentBlockHash: block.hash,
    createdAt: new Date().toISOString(),
  };
  const dir = path.join(manifestDir(), "base-sepolia");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`manifest written to ${path.join(dir, "manifest.json")}`);
  console.log(`networkId=${manifest.networkId} deployment=${deploymentId} catalogVersion=2 relayer=${relayer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
