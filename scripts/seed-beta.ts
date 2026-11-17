import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
import type { NetworkManifest } from "../src/backend/services/onchain/manifests";
import type { TestnetManifest } from "../src/backend/services/onchain/testnet";
import { fetchStocksPage } from "../src/backend/services/stocks/base-stocks-client";
import { stockReference } from "../src/backend/services/stocks/reference";
import { stockService } from "../src/backend/services/stocks";
import { treasuryService } from "../src/backend/services/treasury";
import { walletService } from "../src/backend/services/wallets";
import { db } from "../src/server/db";
import { sha256Hex } from "../src/utils";

function seedTokenAddress(symbol: string): string {
  return `0x${sha256Hex(`v3st:seed:${symbol}`).slice(0, 40)}`;
}

async function main(): Promise<void> {
  assertBetaRuntime(process.env);
  await walletService.ensureTreasuryWallets();
  const sepoliaManifestFile = path.join(process.cwd(), ".testnet", "base-sepolia", "manifest.json");
  const opening: {
    treasuryMicroUsdc: Partial<Record<import("../src/backend/services/wallets/chains").Chain, bigint>>;
    floatMicroUsd: bigint;
  } = {
    treasuryMicroUsdc: { base: 100_000_000_000n, solana: 0n },
    floatMicroUsd: 10_000_000_000n,
  };
  if (existsSync(sepoliaManifestFile)) {
    opening.treasuryMicroUsdc.basesepolia = 1_000_000_000_000n;
  }
  await treasuryService.seedOpeningBalances(opening);
  await stockService.upsertCatalog([
    {
      symbol: "TSTA",
      assetKey: `sim:base:${seedTokenAddress("TSTA").toLowerCase()}`,
      name: "Test Stock A (simulated)",
      chain: "base",
      tokenAddress: seedTokenAddress("TSTA"),
      decimals: 6,
      enabled: true,
      simPriceMicroUsdc: 2_000_000n,
      simWeeklyEarningMicroPerShare: 200_000n,
    },
    {
      symbol: "TSTB",
      assetKey: `sim:base:${seedTokenAddress("TSTB").toLowerCase()}`,
      name: "Test Stock B (simulated)",
      chain: "base",
      tokenAddress: seedTokenAddress("TSTB"),
      decimals: 6,
      enabled: true,
      simPriceMicroUsdc: 5_000_000n,
      simWeeklyEarningMicroPerShare: 250_000n,
    },
  ]);
  const manifestFile = path.join(process.cwd(), ".testnet", "manifest.json");
  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as TestnetManifest;
    const network = await db.onchainNetwork.findUnique({
      where: { deploymentId: manifest.deploymentId },
    });
    if (network) {
      for (const [contractName, symbol, name, reference] of [
        ["StockTokenTSTA", "TSTA", "Test Stock A (testnet)", "base:8453:0x1111111111111111111111111111111111111111"],
        ["StockTokenTSTB", "TSTB", "Test Stock B (testnet)", "base:8453:0x2222222222222222222222222222222222222222"],
      ] as const) {
        const entry = manifest.contracts[contractName];
        if (!entry) continue;
        const assetKeyValue = `testnet-${manifest.deploymentId}:${manifest.chainId}:${entry.address.toLowerCase()}`;
        await stockService.upsertCatalog([
          {
            symbol,
            assetKey: assetKeyValue,
            name,
            chain: "testnet",
            network: { connect: { id: network.id } },
            tokenAddress: entry.address,
            decimals: 18,
            enabled: true,
            simPriceMicroUsdc: 2_000_000n,
            simWeeklyEarningMicroPerShare: 0n,
            provenance: {
              integration_kind: "local_testnet_replica",
              network_id: manifest.networkId,
              deployment_id: manifest.deploymentId,
              reference_asset_key: reference,
            },
          },
        ]);
      }
      console.log(`seeded testnet catalog rows for deployment ${manifest.deploymentId}`);
    }
  }
  if (existsSync(sepoliaManifestFile)) {
    const manifest = JSON.parse(readFileSync(sepoliaManifestFile, "utf8")) as NetworkManifest;
    const network = await db.onchainNetwork.upsert({
      where: { deploymentId: manifest.deploymentId },
      create: {
        networkId: manifest.networkId,
        chainId: manifest.chainId,
        kind: manifest.integrationKind,
        genesisHash: manifest.genesisHash,
        deploymentId: manifest.deploymentId,
        label: manifest.label,
        rpcLoopback: false,
      },
      update: { networkId: manifest.networkId, genesisHash: manifest.genesisHash },
    });
    const stockToken = manifest.contracts.StockTokenAAPL;
    const pool = manifest.external.HydrexPoolAAPL;
    const positionManager = manifest.external.HydrexPositionManager;
    if (!stockToken || !pool || !positionManager) {
      throw new Error("Base Sepolia manifest is missing StockTokenAAPL or the Hydrex entries");
    }
    // The stand-in maps to the real AAPL token in the synced live feed; without that
    // row the seed aborts rather than inventing a reference.
    let aaplAssetKey: string | null = null;
    let next: string | null = null;
    do {
      const page = stockReference.parseLive(await fetchStocksPage(next));
      const aapl = page.stocks.find((s) => s.symbol === "AAPLc" || s.symbol.startsWith("AAPL"));
      if (aapl) aaplAssetKey = aapl.assetKey;
      next = page.next;
    } while (next !== null && aaplAssetKey === null);
    if (!aaplAssetKey) {
      throw new Error("The tokenized stocks feed has no AAPL row; refusing to seed the Base Sepolia stand-in");
    }
    const stock = await db.stock.upsert({
      where: { assetKey: `basesepolia:${manifest.chainId}:${stockToken.address.toLowerCase()}` },
      create: {
        symbol: "tAAPL",
        assetKey: `basesepolia:${manifest.chainId}:${stockToken.address.toLowerCase()}`,
        name: "Apple Inc. (test token)",
        chain: "basesepolia",
        networkId: network.id,
        tokenAddress: stockToken.address,
        decimals: 18,
        enabled: true,
        simPriceMicroUsdc: 0n,
        simWeeklyEarningMicroPerShare: 0n,
        provenance: {
          integration_kind: "verified_provider_testnet",
          network_id: manifest.networkId,
          deployment_id: manifest.deploymentId,
          standInFor: aaplAssetKey,
          hydrexPool: pool.address,
        },
      },
      update: {
        name: "Apple Inc. (test token)",
        networkId: network.id,
        provenance: {
          integration_kind: "verified_provider_testnet",
          network_id: manifest.networkId,
          deployment_id: manifest.deploymentId,
          standInFor: aaplAssetKey,
          hydrexPool: pool.address,
        },
      },
    });
    await db.strategy.upsert({
      where: { key: "hydrex-aapl-usdc-basesepolia" },
      create: {
        providerId: "hydrex",
        key: "hydrex-aapl-usdc-basesepolia",
        name: "Hydrex tAAPL/USDC liquidity (Base Sepolia)",
        version: "1.0.0",
        disclosureVersion: "1.0.0",
        inputAssets: [
          `basesepolia:${manifest.chainId}:${manifest.contracts.TestSettlementToken!.address.toLowerCase()}`,
          stock.assetKey!,
        ],
        receiptAsset: "receipt",
        rewardAssets: [],
        separateClaim: true,
        maxUsdEquivalent: "1000000000000",
        provenance: {
          kind: "hydrex_nft",
          chainId: manifest.chainId,
          pool: pool.address,
          positionManager: positionManager.address,
          stockId: stock.id,
        },
      },
      update: {
        provenance: {
          kind: "hydrex_nft",
          chainId: manifest.chainId,
          pool: pool.address,
          positionManager: positionManager.address,
          stockId: stock.id,
        },
      },
    });
    console.log(`seeded Base Sepolia rows: network ${manifest.networkId}, stock tAAPL, strategy hydrex-aapl-usdc-basesepolia`);
  }
  console.log(
    "beta seed complete: treasury wallets, opening balances (base treasury 100000 USDC, yellowcard float 10000 USDC) and the TSTA/TSTB simulated catalog",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
