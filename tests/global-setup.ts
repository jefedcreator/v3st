import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnv } from "vite";

export default async function globalSetup(): Promise<() => void> {
  const fileEnv = loadEnv("", process.cwd(), "");
  const testUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is not set; refusing to run tests against the dev database");
  }
  if (testUrl === devUrl) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  }
  const dbName = new URL(testUrl).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL database name must end in "_test" (got "${dbName}")`);
  }
  // Apply pending migrations only. Tests truncate their own data (tests/helpers/db.ts),
  // so no destructive `migrate reset` is needed — Prisma refuses that from agent sessions.
  execFileSync(
    "yarn",
    ["prisma", "migrate", "deploy"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testUrl },
    },
  );

  // Start an isolated loopback Anvil (chain 31337, no fork) and deploy the labelled
  // test contracts once per run. Ephemeral test-only signer material is generated
  // here and never written to git.
  // A fixed port lets a stale anvil from a timed-out run poison later runs (its
  // advanced clock breaks onchain deadlines), so default to a random loopback port.
  const port = process.env.TESTNET_PORT ?? String(20_000 + Math.floor(Math.random() * 20_000));
  const url = `http://127.0.0.1:${port}`;
  const { startAnvil, waitForRpc, testnetService, relayerAccount } = await import(
    "../src/backend/services/onchain/testnet"
  );
  const { generatePrivateKey } = await import("viem/accounts");
  const stateDir = mkdtempSync(path.join(tmpdir(), "v3st-testnet-"));
  process.env.TESTNET_STATE_DIR = stateDir;
  process.env.TESTNET_RPC_URL = url;
  process.env.TESTNET_SIGNER_PRIVATE_KEY = generatePrivateKey();
  const child = startAnvil({ rpcUrl: url });
  await waitForRpc(url);
  await testnetService.fundEphemeral(relayerAccount(), url);
  execFileSync("forge", ["build"], { stdio: "inherit" });
  const manifest = await testnetService.deploy(
    [
      { name: "TestSettlementToken", artifact: "TestSettlementToken", args: ["V3ST Test USDC", "tUSDC", 6] },
      { name: "TestStockRegistry", artifact: "TestStockRegistry", args: [] },
      { name: "O1RouterReplica", artifact: "O1RouterReplica", args: [] },
      { name: "HydropumpLockerReplica", artifact: "HydropumpLockerReplica", args: [] },
      { name: "StockDistributionReplica", artifact: "StockDistributionReplica", args: [] },
      { name: "HookFeeReplica", artifact: "HookFeeReplica", args: [] },
    ],
    { url },
  );
  process.env.TESTNET_DEPLOYMENT_ID = manifest.deploymentId;
  process.env.TESTNET_NETWORK_ID = manifest.networkId;
  console.log(
    `testnet ready: ${url} chain=${manifest.chainId} deployment=${manifest.deploymentId} contracts=${Object.keys(manifest.contracts).join(",")}`,
  );
  return () => {
    child.kill("SIGTERM");
    rmSync(stateDir, { recursive: true, force: true });
  };
}
