/** Seeds the app e2e database: the testnet network, the treasury and TSTA. */
import { db } from "../src/server/db";
import { now } from "../src/backend/clock";
import { publicClientFor } from "../src/backend/services/onchain/testnet";
import { setNow } from "../tests/helpers/time";
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
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  setNow(new Date(Math.max(Date.now(), Number(block.timestamp) * 1000)).toISOString());
  console.log("Seeded TSTA", stock.id);
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
