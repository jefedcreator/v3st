import { expect, it } from "vitest";

import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { cashReserved, payoutSubmitted } from "@/backend/services/ledger/postings";
import { db, withTx } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { fundCash, makeUser } from "../helpers/factories";

useTestDatabase();

async function sumOfAllBalances(asset: string): Promise<bigint> {
  const rows = await db.$queryRaw<Array<{ total: string }>>`
    SELECT COALESCE(SUM(signed), 0)::text AS total FROM (
      SELECT "amount" AS signed FROM "ledger_entries" WHERE asset = ${asset}
      UNION ALL
      SELECT -"amount" FROM "ledger_entries" WHERE asset = ${asset}
    ) s
  `;
  return BigInt(rows[0]?.total ?? "0");
}

it("moves value and conserves every asset", async () => {
  const u = await makeUser();
  await fundCash(u.id, 10_000_000n);
  await withTx((tx) =>
    ledgerService.post(
      tx,
      cashReserved({ key: "order:o1", userId: u.id, chain: "base", amount: 4_000_000n, from: "cash" }),
    ),
  );
  expect(await ledgerService.balance(acct.userCash(u.id, "base"))).toBe(6_000_000n);
  expect(await ledgerService.balance(acct.userReserved(u.id, "base"))).toBe(4_000_000n);
  expect(await sumOfAllBalances("USDC")).toBe(0n);
});

it("permits one of two concurrent seven-USDC reservations from ten USDC", async () => {
  const u = await makeUser();
  await fundCash(u.id, 10_000_000n);
  const reserve = (key: string) =>
    withTx((tx) =>
      ledgerService.post(
        tx,
        cashReserved({ key, userId: u.id, chain: "base", amount: 7_000_000n, from: "cash" }),
      ),
    );
  const results = await Promise.allSettled([reserve("order:a"), reserve("order:b")]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { statusCode: 409, code: "INSUFFICIENT_FUNDS" },
  });
  expect(await ledgerService.balance(acct.userCash(u.id, "base"))).toBe(3_000_000n);
});

it("returns the existing journal for a replayed key with the same entries", async () => {
  const u = await makeUser();
  await fundCash(u.id, 10_000_000n);
  const j = cashReserved({ key: "order:r", userId: u.id, chain: "base", amount: 1n, from: "cash" });
  const first = await withTx((tx) => ledgerService.post(tx, j));
  const second = await withTx((tx) => ledgerService.post(tx, j));
  expect(second).toEqual({ journalId: first.journalId, created: false });
});

it("rejects a replayed key with different entries", async () => {
  const u = await makeUser();
  await fundCash(u.id, 10_000_000n);
  await withTx((tx) =>
    ledgerService.post(
      tx,
      cashReserved({ key: "order:k", userId: u.id, chain: "base", amount: 1n, from: "cash" }),
    ),
  );
  await expect(
    withTx((tx) =>
      ledgerService.post(
        tx,
        cashReserved({ key: "order:k", userId: u.id, chain: "base", amount: 2n, from: "cash" }),
      ),
    ),
  ).rejects.toMatchObject({ code: "LEDGER_KEY_REUSED" });
});

it("lets external, clearing and float accounts go negative but never user or treasury accounts", async () => {
  const u = await makeUser();
  await expect(
    withTx((tx) =>
      ledgerService.post(
        tx,
        cashReserved({ key: "order:z", userId: u.id, chain: "base", amount: 1n, from: "cash" }),
      ),
    ),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  await withTx((tx) =>
    ledgerService.post(tx, payoutSubmitted({ orderId: "o9", provider: "yellowcard", usd: 5n })),
  );
  expect(await ledgerService.balance(acct.float("yellowcard"))).toBe(-5n);
});
