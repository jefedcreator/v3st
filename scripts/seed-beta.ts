import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
import type { TestnetManifest } from "../src/backend/services/onchain/testnet";
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
  const opening = {
    treasuryMicroUsdc: { base: 100_000_000_000n, solana: 0n },
    floatMicroUsd: 10_000_000_000n,
  };
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
