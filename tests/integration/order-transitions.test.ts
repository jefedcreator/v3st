import { expect, it } from "vitest";

import { alertService } from "@/backend/services/alerts";
import { controlsService } from "@/backend/services/controls";
import { orderService } from "@/backend/services/orders";
import { cashReserved, depositReceived } from "@/backend/services/ledger/postings";
import { db, withTx } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeOrder } from "../helpers/factories";

useTestDatabase();

it("writes order, audit, user event, journal and job in one transaction", async () => {
  const order = await makeOrder({ kind: "deposit", status: "awaiting_transfer" });
  await withTx((tx) =>
    orderService.transition(tx, {
      order,
      to: "received",
      actor: "test",
      journals: [
        depositReceived({
          orderId: order.id,
          userId: order.userId,
          provider: "yellowcard",
          usd: 12_375_000n,
        }),
      ],
      jobs: [{ kind: "deposit.progress", subjectId: order.id }],
    }),
  );
  expect(await db.rampOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
    status: "received",
    version: 1,
  });
  expect(
    await db.orderTransition.count({ where: { orderId: order.id, toStatus: "received" } }),
  ).toBe(1);
  expect(await db.userEvent.count({ where: { subjectId: order.id, status: "received" } })).toBe(1);
  expect(await db.ledgerJournal.count({ where: { key: `deposit:${order.id}:received` } })).toBe(1);
  expect(await db.job.count({ where: { key: `deposit.progress:${order.id}` } })).toBe(1);
});

it("rejects a transition outside the matrix", async () => {
  const order = await makeOrder({ kind: "withdrawal", status: "paid" });
  await expect(
    withTx((tx) => orderService.transition(tx, { order, to: "submitted", actor: "test" })),
  ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_TRANSITION" });
});

it("rejects a stale version", async () => {
  const order = await makeOrder({ kind: "deposit", status: "created" });
  await withTx((tx) => orderService.transition(tx, { order, to: "awaiting_transfer", actor: "a" }));
  await expect(
    withTx((tx) => orderService.transition(tx, { order, to: "failed", actor: "b" })),
  ).rejects.toMatchObject({ code: "STALE_STATE" });
});

it("leaves no partial writes when a journal fails", async () => {
  const order = await makeOrder({ kind: "withdrawal", status: "created" });
  await expect(
    withTx((tx) =>
      orderService.transition(tx, {
        order,
        to: "funds_collected",
        actor: "t",
        journals: [
          cashReserved({
            key: `order:${order.id}`,
            userId: order.userId,
            chain: "base",
            amount: 1n,
            from: "cash",
          }),
        ],
        jobs: [{ kind: "payout.progress", subjectId: order.id }],
      }),
    ),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  expect(await db.rampOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
    status: "created",
    version: 0,
  });
  expect(await db.orderTransition.count()).toBe(0);
  expect(await db.userEvent.count()).toBe(0);
  expect(await db.job.count()).toBe(0);
});

it("records a hold without changing status", async () => {
  const order = await makeOrder({ kind: "deposit", status: "awaiting_transfer" });
  await withTx((tx) =>
    orderService.transition(tx, {
      order,
      to: "awaiting_transfer",
      actor: "test",
      patch: { holdReason: "treasury_short" },
    }),
  );
  const updated = await db.rampOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(updated).toMatchObject({ status: "awaiting_transfer", version: 1, holdReason: "treasury_short" });
  expect(await db.orderTransition.count({ where: { orderId: order.id } })).toBe(1);
});

it("raises an alert once per open dedupe key", async () => {
  await alertService.raise(db, {
    kind: "recon.breach",
    severity: "critical",
    dedupeKey: "k1",
    message: "m",
  });
  await alertService.raise(db, {
    kind: "recon.breach",
    severity: "critical",
    dedupeKey: "k1",
    message: "m",
  });
  expect(await db.operationalAlert.count({ where: { dedupeKey: "k1" } })).toBe(1);
  const first = await db.operationalAlert.findUniqueOrThrow({ where: { dedupeKey: "k1" } });
  await alertService.resolve(first.id, "op1");
  await alertService.raise(db, {
    kind: "recon.breach",
    severity: "critical",
    dedupeKey: "k1",
    message: "m",
  });
  expect(await db.operationalAlert.count({ where: { dedupeKey: "k1" } })).toBe(2);
});

it("reports paused scopes and rejects with 503", async () => {
  await controlsService.set(db, {
    scope: "deposits",
    paused: true,
    reason: "maintenance",
    actorId: null,
  });
  expect(await controlsService.isPaused("deposits")).toBe(true);
  await expect(controlsService.assertOpen("deposits", "DEPOSITS_PAUSED")).rejects.toMatchObject({
    statusCode: 503,
    code: "DEPOSITS_PAUSED",
  });
  expect(await controlsService.isPaused("payouts")).toBe(false);
});
