import { execFileSync } from "node:child_process";

import { persistNetwork } from "../src/backend/services/onchain/networks";
import { testnetService, testnetRpcUrl, waitForRpc } from "../src/backend/services/onchain/testnet";

async function main(): Promise<void> {
  const url = testnetRpcUrl();
  await waitForRpc(url);
  execFileSync("forge", ["build"], { stdio: "inherit" });
  const manifest = await testnetService.deploy([
    { name: "TestSettlementToken", artifact: "TestSettlementToken", args: ["V3ST Test USDC", "tUSDC", 6] },
    { name: "TestStockRegistry", artifact: "TestStockRegistry", args: [] },
    { name: "O1RouterReplica", artifact: "O1RouterReplica", args: [] },
    { name: "HydropumpLockerReplica", artifact: "HydropumpLockerReplica", args: [] },
    { name: "StockTokenTSTA", artifact: "TestStockToken", args: ["Test Stock A", "TSTA", 1000000000000000000000000n] },
    { name: "StockTokenTSTB", artifact: "TestStockToken", args: ["Test Stock B", "TSTB", 1000000000000000000000000n] },
  ]);
  await persistNetwork(manifest);
  const { publicClientFor, walletClientFor, relayerAccount, settlementAssetKey, stockAssetKey } = await import(
    "../src/backend/services/onchain/testnet"
  );
  const { stockRegistryAbi } = await import("../src/backend/services/onchain/abis");
  const publicClient = publicClientFor(url);
  const wallet = walletClientFor(relayerAccount(), url);
  const registry = manifest.contracts.TestStockRegistry!.address;
  const stocks: [string, string, string][] = [
    ["StockTokenTSTA", "TSTA", "Test Stock A"],
    ["StockTokenTSTB", "TSTB", "Test Stock B"],
  ];
  for (const [contractName, symbol, name] of stocks) {
    const token = manifest.contracts[contractName]!.address;
    const key = await wallet.writeContract({
      address: registry,
      abi: stockRegistryAbi,
      functionName: "registerInstrument",
      args: [
        token,
        stockAssetKey(manifest, token),
        symbol,
        name,
        18,
        "stock",
        "V3ST fixture issuer",
        "tokenized stock exposure; no voting or direct redemption rights",
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: key });
    console.log(`  registered ${symbol} at ${token}`);
  }
  void settlementAssetKey;
  void publicClient;
  console.log(`deployed ${Object.keys(manifest.contracts).length} test contracts`);
  console.log(`networkId=${manifest.networkId} deploymentId=${manifest.deploymentId}`);
  for (const [name, entry] of Object.entries(manifest.contracts)) {
    console.log(`  ${name}: ${entry.address} (abi ${entry.abiHash})`);
  }
  console.log(`relayer=${manifest.relayerAddress} manifest=.testnet/manifest.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
