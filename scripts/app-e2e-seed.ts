/** Seeds the app e2e database: the testnet network, the treasury and TSTA. */
// Uses only the Vitest-free helpers (testnet, factories); never
// tests/helpers/{db,app,journey,time}.ts.
import { db } from "../src/server/db";
import { now } from "../src/backend/clock";
import { seedTreasury } from "../tests/helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../tests/helpers/testnet";

async function main() {
  const handle = await testnet();
  await ensureTestnetNetwork();
  await seedTreasury("testnet", 1_000_000_000_000n);
  const { stock, token } = await makeTestnetStock({
    symbol: "TSTA",
    referencePriceMicroUsd: 2_000_000n,
  });
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  await db.stock.update({
    where: { id: stock.id },
    data: {
      displayTicker: "TSTA",
      referenceAsOf: now(),
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "share_price",
    },
  });
  console.log("Seeded TSTA", stock.id);
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
