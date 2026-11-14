import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
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
