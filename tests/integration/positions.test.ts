import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pack } from "@/backend/services/execution";
import type { Prisma } from "@/server/prisma";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
import { ledgerService } from "@/backend/services/ledger";
import { settlementAssetKey } from "@/backend/services/onchain/testnet";
import { positionService } from "@/backend/services/positions";
import { portfolioService } from "@/backend/services/portfolio";
import { stockActionService } from "@/backend/services/stocks/corporate-actions";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db, withTx } from "@/server/db";
import { fromDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

async function ingestConfirmed(networkId: string, throughBlock: bigint) {
  await (await testnet()).mine(3);
  return stockActionService.ingest(networkId, throughBlock);
}


const SHARE_PRICE = 100_000_000n; // $100 per share, micro-USD

async function setup(symbol = "POS") {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token, registryKey } = await makeTestnetStock({ symbol, referencePriceMicroUsd: SHARE_PRICE });
  return { handle, network, u, ref, stock, token, registryKey };
}

async function fakeFill(
  ctx: Awaited<ReturnType<typeof setup>>,
  side: "buy" | "sell",
  stockRaw: bigint,
  cashRaw: bigint,
  feeRaw = 0n,
) {
  const settlement = settlementAssetKey(ctx.handle.manifest);
  const op = await db.onchainOperation.create({
    data: {
      key: `pos-op-${randomUUID()}`,
      requestHash: "test",
      kind: "spot",
      userId: ctx.u.id,
      walletId: ctx.ref.wallet.id,
      custodyProfileId: ctx.ref.custodyProfileId,
      networkId: ctx.network.id,
      providerId: "o1",
      status: "finalized",
      fingerprint: "test",
      requiredConfirmations: 2,
      expected: pack({
        quote: {
          stockId: ctx.stock.id,
          input: { asset: side === "buy" ? settlement : ctx.stock.assetKey!, raw: (side === "buy" ? cashRaw : stockRaw).toString() },
          expectedOutput: { asset: side === "buy" ? ctx.stock.assetKey! : settlement, raw: (side === "buy" ? stockRaw : cashRaw).toString() },
        },
        recipient: ctx.ref.accountAddress,
      }) as Prisma.InputJsonValue,
      actual: pack({
        input: { asset: side === "buy" ? settlement : ctx.stock.assetKey!, raw: side === "buy" ? cashRaw : stockRaw },
        output: { asset: side === "buy" ? ctx.stock.assetKey! : settlement, raw: side === "buy" ? stockRaw : cashRaw },
      }) as Prisma.InputJsonValue,
    },
  });
  await positionService.applyFill(db, op.id, feeRaw);
  if (side === "buy") {
    await withTx((tx) => ledgerService.post(tx, openingBalance({ account: acct.userStock(ctx.u.id, ctx.stock.id), amount: stockRaw })));
  } else {
    await withTx((tx) =>
      ledgerService.post(tx, openingBalance({ account: acct.userCash(ctx.u.id, "testnet"), amount: cashRaw })),
    );
  }
  return op;
}

async function applySplit(ctx: Awaited<ReturnType<typeof setup>>, toWad: bigint, newSharePrice: bigint) {
  const past = Math.floor(Date.now() / 1000) - 1;
  await ctx.handle.scheduleMultiplier(ctx.token, toWad, past);
  await ctx.handle.advanceTime(5);
  await ctx.handle.applyDueActions(ctx.token);
  await ingestConfirmed(ctx.network.id, await ctx.handle.blockNumber());
  await ctx.handle.setReferencePrice(ctx.registryKey, newSharePrice, "share_price", Math.floor(Date.now() / 1000));
  await db.stock.update({
    where: { id: ctx.stock.id },
    data: { referencePriceMicroUsd: newSharePrice, referenceAsOf: new Date() },
  });
}

describe("multiplier-aware positions and performance", () => {
  it("keeps holdings visible with unavailable values when the reference is stale", async () => {
    const ctx = await setup("STALEPOS");
    await fakeFill(ctx, "buy", 10n ** 18n, 100_000_000n);
    await db.stock.update({ where: { id: ctx.stock.id }, data: { referenceAsOf: new Date(Date.now() - 120_000) } });
    const [position] = await positionService.list(ctx.u.id);
    expect(position).toMatchObject({ raw_owned: (10n ** 18n).toString(), value_usdc: null, unrealized_usdc: null, valuation_status: "unavailable" });
    const portfolio = await portfolioService.get(ctx.u.id);
    expect(portfolio.holdings[0]).toMatchObject({ price_usdc: null, value_usdc: null });
    expect(portfolio.valuation).toBe("partial");
  });

  it("values token NAV without applying the multiplier again", async () => {
    const ctx = await setup("TOKENNAV");
    await fakeFill(ctx, "buy", 2n * 10n ** 18n, 200_000_000n);
    await applySplit(ctx, 2n * 10n ** 18n, SHARE_PRICE);
    await db.stock.update({ where: { id: ctx.stock.id }, data: { referenceBasis: "token_nav" } });
    const [position] = await positionService.list(ctx.u.id);
    expect(position!.value_usdc).toBe("200000000");
    expect(position!.share_equivalent_raw).toBe((4n * 10n ** 18n).toString());
  });

  it("stockSplitDoesNotChangeCostBasis", { timeout: 60_000 }, async () => {
    const ctx = await setup("SPLIT");
    await fakeFill(ctx, "buy", 2n * 10n ** 18n, 200_000_000n);
    let positions = await positionService.list(ctx.u.id);
    expect(positions.length).toBe(1);
    expect(positions[0]!.cost_basis_usdc).toBe("200000000");
    expect(positions[0]!.value_usdc).toBe("200000000");
    // 2:1 split with halved share price: value and cost basis unchanged, no cash journal.
    const journalsBefore = await db.ledgerJournal.count();
    await applySplit(ctx, 2n * 10n ** 18n, 50_000_000n);
    positions = await positionService.list(ctx.u.id);
    expect(positions[0]!.multiplier_wad).toBe((2n * 10n ** 18n).toString());
    expect(positions[0]!.share_equivalent_raw).toBe((4n * 10n ** 18n).toString());
    expect(positions[0]!.value_usdc).toBe("200000000");
    expect(positions[0]!.cost_basis_usdc).toBe("200000000");
    expect(await db.ledgerJournal.count()).toBe(journalsBefore);
  });

  it("navIsNotMultipliedTwice", { timeout: 60_000 }, async () => {
    const ctx = await setup("NAV");
    await fakeFill(ctx, "buy", 2n * 10n ** 18n, 200_000_000n);
    // Multiplier 2 applied to the share-equivalent only: 4 shares x $100 = $400,
    // never 2x again on the price side.
    await applySplit(ctx, 2n * 10n ** 18n, SHARE_PRICE);
    const positions = await positionService.list(ctx.u.id);
    expect(positions[0]!.share_equivalent_raw).toBe((4n * 10n ** 18n).toString());
    expect(positions[0]!.value_usdc).toBe("400000000");
    expect(positions[0]!.unrealized_usdc).toBe("200000000");
  });

  it("delistedHoldingRemainsVisible", { timeout: 60_000 }, async () => {
    const ctx = await setup("DEL");
    await fakeFill(ctx, "buy", 1n * 10n ** 18n, 100_000_000n);
    await db.stock.update({ where: { id: ctx.stock.id }, data: { delisted: true, paused: true } });
    const positions = await positionService.list(ctx.u.id);
    expect(positions.length).toBe(1);
    expect(positions[0]!.delisted).toBe(true);
    expect(positions[0]!.raw_owned).toBe((1n * 10n ** 18n).toString());
    const portfolio = await portfolioService.get(ctx.u.id);
    expect(portfolio.positions.length).toBe(1);
    expect(portfolio.positions[0]!.delisted).toBe(true);
  });

  it("saleProceedsAreNotAllProfit: realized gain 1,900,000 on cost 10,000,000, proceeds 12,000,000, fee 100,000", { timeout: 60_000 }, async () => {
    const ctx = await setup("SALE");
    await fakeFill(ctx, "buy", 2n * 10n ** 18n, 10_000_000n);
    await fakeFill(ctx, "sell", 2n * 10n ** 18n, 12_000_000n, 100_000n);
    const lots = await db.positionLot.findMany({ where: { userId: ctx.u.id, stockId: ctx.stock.id } });
    expect(lots.length).toBe(1);
    expect(lots[0]!.closedAt).not.toBeNull();
    expect(fromDbRaw(lots[0]!.realizedUsdc)).toBe(1_900_000n);
    const positions = await positionService.list(ctx.u.id);
    const position = positions.find((p) => p.stock_id === ctx.stock.id);
    expect(position?.realized_usdc).toBe("1900000");
    // Principal of 10,000,000 was returned, not counted as profit.
    expect(fromDbRaw(lots[0]!.costUsdc)).toBe(0n);
  });
});
