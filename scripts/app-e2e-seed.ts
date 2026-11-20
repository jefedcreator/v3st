/**
 * Seeds the app e2e database: the testnet network, the treasury, the stock
 * TSTA with an O1 pool, and an Earn product on a Hydrex pool for TSTA (the
 * same world `tests/app/earn.test.ts` builds).
 */
import { randomUUID } from "node:crypto";

import { encodeFunctionData } from "viem";

// Uses only the Vitest-free helpers (testnet, factories); never
// tests/helpers/{db,app,journey,time}.ts.
import { db } from "../src/server/db";
import { hydrexPoolAbi, settlementTokenAbi, stockTokenAbi } from "../src/backend/services/onchain/abis";
import { settlementAssetKey } from "../src/backend/services/onchain/testnet";
import { toDbRaw } from "../src/utils/asset-units";
import { now } from "../src/backend/clock";
import { seedTreasury } from "../tests/helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../tests/helpers/testnet";

const SEED_SETTLEMENT = 1_000_000_000_000n;
const SEED_STOCK = 500_000n * 10n ** 18n;

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

  // The Earn product: a Hydrex pool for TSTA, seeded with liquidity.
  const pool = await handle.deployHydrexPool(token);
  await db.stock.update({
    where: { id: stock.id },
    data: { provenance: Object.assign({}, stock.provenance as object, { hydrexPool: pool }) },
  });
  await handle.mintSettlement(handle.account.address, SEED_SETTLEMENT);
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({
      abi: stockTokenAbi,
      functionName: "transfer",
      args: [handle.account.address, SEED_STOCK],
    }),
  });
  await handle.sendTx({
    to: handle.settlement,
    data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [pool, SEED_SETTLEMENT] }),
  });
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [pool, SEED_STOCK] }),
  });
  await handle.sendTx({
    to: pool,
    data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "seed", args: [SEED_SETTLEMENT, SEED_STOCK] }),
  });
  const strategy = await db.strategy.create({
    data: {
      providerId: "hydrex",
      key: `hydrex-lp-earn-${randomUUID()}`,
      name: "TSTA LP replica",
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [settlementAssetKey(handle.manifest), stock.assetKey!],
      receiptAsset: `lp:31337:${pool.toLowerCase()}`,
      rewardAssets: [stock.assetKey!],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: { pool, stockId: stock.id, chainId: 31337 },
    },
  });
  console.log("Seeded TSTA", stock.id, "and Earn", strategy.id);
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
