import { describe, expect, it } from "vitest";

import { db, withTx } from "@/server/db";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
import { toDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { makeStock, makeUser } from "../helpers/factories";

useTestDatabase();

async function makeNetwork() {
  return db.onchainNetwork.create({
    data: {
      networkId: "testnet:31337:test",
      chainId: 31337,
      kind: "local_testnet_replica",
      genesisHash: "0xabc",
      deploymentId: "dep-test-1",
      label: "isolated anvil",
    },
  });
}

describe("onchain schema", () => {
  it("keeps pre-existing earnings rows as legacy_fixture provenance and never reinterprets old journals", async () => {
    const u = await makeUser();
    const s = await makeStock();
    const earning = await db.earning.create({
      data: {
        userId: u.id,
        stockId: s.id,
        week: "2026-11-09",
        chain: "base",
        amountUsdc: 1_000_000n,
        harvestedAt: new Date("2026-11-12T21:00:00Z"),
      },
    });
    expect(earning.provenance).toBe("legacy_fixture");
    const journal = await db.ledgerJournal.create({
      data: { key: "legacy-journal", kind: "earningHarvested", requestHash: "abc" },
    });
    expect(journal.kind).toBe("earningHarvested");
    await expect(
      db.ledgerJournal.update({ where: { id: journal.id }, data: { kind: "rewritten" } }),
    ).rejects.toThrow();
  });

  it("stores exact 18-decimal raw quantities in ledger entries and receipts", async () => {
    const u = await makeUser();
    const s = await makeStock();
    const raw = 123_456_789n * 10n ** 18n + 7n;
    await withTx((tx) =>
      ledgerService.post(
        tx,
        openingBalance({ account: acct.userStock(u.id, s.id), amount: raw }),
      ),
    );
    expect(await ledgerService.balance(acct.userStock(u.id, s.id))).toBe(raw);

    const network = await makeNetwork();
    const receipt = await db.rewardReceipt.create({
      data: {
        networkId: network.id,
        source: "hydrex_lp_fees",
        txHash: "0x01",
        logIndex: 0,
        beneficiary: u.id,
        asset: "testnet:31337:0xusdc",
        amountRaw: toDbRaw(raw),
        accrualPeriod: "2026-11-09",
        state: "received_asset",
      },
    });
    expect(receipt.amountRaw.toString()).toBe(raw.toString());
  });

  it("rejects duplicate source receipts on the (network, source, txHash, logIndex, beneficiary) identity", async () => {
    const u = await makeUser();
    const network = await makeNetwork();
    const data = {
      networkId: network.id,
      source: "feel_distribution" as const,
      txHash: "0x02",
      logIndex: 3,
      beneficiary: u.id,
      asset: "testnet:31337:0xusdc",
      amountRaw: toDbRaw(5n),
    };
    await db.rewardReceipt.create({ data });
    await expect(db.rewardReceipt.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects cross-currency ledger postings and immutable journal reuse with a changed payload", async () => {
    const u = await makeUser();
    await expect(
      withTx((tx) =>
        ledgerService.post(tx, {
          key: "cross-currency",
          kind: "test",
          orderId: null,
          entries: [
            {
              debit: acct.userCash(u.id, "base"),
              credit: acct.equityOpening("USD"),
              amount: 1n,
            },
          ],
        }),
      ),
    ).rejects.toThrow(/assets differ/);

    await withTx((tx) =>
      ledgerService.post(tx, {
        key: "immutable-key",
        kind: "test",
        orderId: null,
        entries: [
          { debit: acct.equityOpening("USDC"), credit: acct.userCash(u.id, "base"), amount: 10n },
        ],
      }),
    );
    await expect(
      withTx((tx) =>
        ledgerService.post(tx, {
          key: "immutable-key",
          kind: "test",
          orderId: null,
          entries: [
            { debit: acct.equityOpening("USDC"), credit: acct.userCash(u.id, "base"), amount: 20n },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "LEDGER_KEY_REUSED" });
  });
});
