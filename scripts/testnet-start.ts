import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { startAnvil, testnetRpcUrl, waitForRpc } from "../src/backend/services/onchain/testnet";

async function main(): Promise<void> {
  const url = testnetRpcUrl();
  const child = startAnvil({ rpcUrl: url });
  mkdirSync(path.join(process.cwd(), ".testnet"), { recursive: true });
  writeFileSync(path.join(process.cwd(), ".testnet", "anvil.pid"), String(child.pid ?? ""));
  await waitForRpc(url);
  console.log(`isolated local anvil listening on ${url} (chain 31337, no fork; pid ${child.pid ?? "?"})`);
  console.log("next: yarn testnet:deploy");
  const shutdown = (): void => {
    child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
