import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { now } from "@/backend/clock";
import {
  WAD,
  positionValueMicroUsd,
  shareEquivalentRaw,
  stockActionService,
} from "@/backend/services/stocks/corporate-actions";
import { referenceUsable } from "@/backend/services/stocks/reference";

import { useTestDatabase } from "../helpers/db";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

describe("stock corporate actions on the local testnet", () => {
  it("splitPreservesRawQuantityAndValue: multiplier 1->2 with halved share price keeps value and posts no cash journal", async () => {
    const handle = await testnet();
    const network = await ensureTestnetNetwork();
    const { stock, token } = await makeTestnetStock({ symbol: "SPLT", referencePriceMicroUsd: 100_000_000n });

    const holder = handle.account.address;
    await handle.sendTx({
      to: token,
      data: (await import("viem")).encodeFunctionData({
        abi: (await import("@/backend/services/onchain/abis")).stockTokenAbi,
        functionName: "transfer",
        args: [holder, 2n * 10n ** 18n],
      }),
    });
    expect(await handle.tokenBalance(token, holder)).toBe(2n * 10n ** 18n);

    const effectiveAt = Math.floor(Date.now() / 1000) + 1;
    await handle.scheduleMultiplier(token, 2n * WAD, effectiveAt);
    await handle.advanceTime(5);
    await handle.applyDueActions(token);
    expect(await handle.tokenMultiplier(token)).toBe(2n * WAD);

    const inserted = await stockActionService.ingest(network.id, await handle.blockNumber());
    expect(inserted).toBe(1);
    expect(await stockActionService.effectiveMultiplier(stock.id, now())).toBe(2n * WAD);

    const raw = await handle.tokenBalance(token, holder);
    expect(raw).toBe(2n * 10n ** 18n);
    const shareEquivalent = shareEquivalentRaw(raw, 2n * WAD);
    expect(shareEquivalent).toBe(4n * 10n ** 18n);
    const valueBefore = positionValueMicroUsd(raw, 100_000_000n, 18);
    const valueAfter = positionValueMicroUsd(shareEquivalent, 50_000_000n, 18);
    expect(valueBefore).toBe(200_000_000n);
    expect(valueAfter).toBe(200_000_000n);

    const cashJournals = await db.ledgerJournal.count();
    expect(cashJournals).toBe(0);
  });

  it("cancelled scheduled updates never change the multiplier", async () => {
    const handle = await testnet();
    const network = await ensureTestnetNetwork();
    const { stock, token } = await makeTestnetStock({ symbol: "CNCL" });
    const effectiveAt = Math.floor(Date.now() / 1000) + 1;
    await handle.scheduleMultiplier(token, 3n * WAD, effectiveAt);
    await handle.cancelAction(token, 0n);
    await handle.advanceTime(5);
    await handle.applyDueActions(token);
    await stockActionService.ingest(network.id, await handle.blockNumber());
    expect(await stockActionService.effectiveMultiplier(stock.id, now())).toBe(WAD);
  });

  it("duplicate ingestion of the same logs is idempotent", async () => {
    const handle = await testnet();
    const network = await ensureTestnetNetwork();
    const { token } = await makeTestnetStock({ symbol: "DUPL" });
    await handle.scheduleMultiplier(token, 2n * WAD, Math.floor(Date.now() / 1000));
    await handle.applyDueActions(token);
    const block = await handle.blockNumber();
    const first = await stockActionService.ingest(network.id, block);
    const second = await stockActionService.ingest(network.id, block);
    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(await db.stockAction.count({ where: { networkId: network.id } })).toBe(1);
  });

  it("reorg rollback before finality removes unfinalized actions", async () => {
    const handle = await testnet();
    const network = await ensureTestnetNetwork();
    const { stock, token } = await makeTestnetStock({ symbol: "REORG" });
    const snapshot = await handle.snapshot();
    const finalized = await handle.blockNumber();
    await handle.scheduleMultiplier(token, 2n * WAD, Math.floor(Date.now() / 1000));
    await handle.applyDueActions(token);
    const reorgedBlock = await handle.blockNumber();
    await stockActionService.ingest(network.id, reorgedBlock);
    expect(await stockActionService.effectiveMultiplier(stock.id, now())).toBe(2n * WAD);
    await handle.revert(snapshot);
    const rolledBack = await stockActionService.rollbackAfterFinality(network.id, finalized);
    expect(rolledBack).toBe(1);
    expect(await stockActionService.effectiveMultiplier(stock.id, now())).toBe(WAD);
  });

  it("missing or stale NAV is not usable for execution", async () => {
    const handle = await testnet();
    await ensureTestnetNetwork();
    const { stock } = await makeTestnetStock({ symbol: "STALE" });
    expect(referenceUsable(stock, now())).toBe(false);
    await db.stock.update({
      where: { id: stock.id },
      data: { referencePriceMicroUsd: 100_000_000n, referenceBasis: "share_price", referenceAsOf: now() },
    });
    const fresh = await db.stock.findUniqueOrThrow({ where: { id: stock.id } });
    expect(referenceUsable(fresh, now())).toBe(true);
    const stale = new Date(now().getTime() - 120_000);
    expect(referenceUsable(fresh, stale)).toBe(false);
    void handle;
  });
});
