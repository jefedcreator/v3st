import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET as eventsGET } from "@/app/api/v1/app/events/route";
import { GET as notificationsGET } from "@/app/api/v1/app/notifications/route";
import { POST as notificationsReadPOST } from "@/app/api/v1/app/notifications/read/route";
import { GET as sessionGET } from "@/app/api/v1/app/session/route";
import { now } from "@/backend/clock";
import { eventService } from "@/backend/services/events";
import { notificationProjector } from "@/backend/services/notifications";
import type { AppNotificationDto } from "@/backend/services/app/inbox";
import { db } from "@/server/db";
import type { AppSessionDto } from "@/types/app";
import { toDbRaw } from "@/utils/asset-units";

import { callAppRoute, ORIGIN, readyCustomer, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { makeOrder, makeStock } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

async function makeCompletedBuyOrder(userId: string, stockId: string) {
  const preview = await db.customerOrderPreview.create({
    data: {
      userId,
      stockId,
      side: "buy",
      mode: "now",
      amountKobo: 100_000n,
      referencePriceMicroUsd: 2_000_000n,
      limitPriceMicroUsd: 2_100_000n,
      rateKobo: 160_000n,
      rateMicroUsd: 1_000_000n,
      terms: { fees: [] },
      expiresAt: new Date(now().getTime() + 60_000),
    },
  });
  return db.customerOrder.create({
    data: {
      userId,
      key: `ord-${randomUUID()}`,
      requestHash: "test",
      previewId: preview.id,
      stockId,
      side: "buy",
      status: "completed",
      amountKobo: 100_000n,
      limitPriceMicroUsd: 2_100_000n,
      rateKobo: 160_000n,
      rateMicroUsd: 1_000_000n,
      quantityRaw: toDbRaw(50_000n * 10n ** 6n),
      expiresAt: new Date(now().getTime() + 60_000),
      completedAt: now(),
    },
  });
}

async function listNotifications(cookie: string) {
  const res = await callAppRoute(notificationsGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/notifications`,
    cookie,
  });
  expect(res.status).toBe(200);
  return dataOf<{ items: AppNotificationDto[]; next_cursor: string | null }>(res.json);
}

describe("customer notifications and live updates", () => {
  it("turns a customer's events into notifications once", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("ntf-1@v3st.test");
    const stock = await makeStock();
    const deposit = await makeOrder({ userId, kind: "deposit", direction: "in", status: "settled", ngnAmount: 500_000n });
    await eventService.emit(db, userId, "order.updated", deposit.id, "settled");
    const order = await makeCompletedBuyOrder(userId, stock.id);
    await eventService.emit(db, userId, "customer_order.updated", order.id, "completed");

    const first = await notificationProjector.run();
    expect(first.created).toBe(2);
    const second = await notificationProjector.run();
    expect(second.created).toBe(0);

    const inbox = await listNotifications(cookie);
    const kinds = inbox.items.map((n) => n.kind).sort();
    expect(kinds).toEqual(["money_added", "order_completed"]);
    const added = inbox.items.find((n) => n.kind === "money_added")!;
    expect(added.title).toBe("Money added");
    expect(added.body).toContain("₦5,000");
    expect(added.read).toBe(false);
    const completed = inbox.items.find((n) => n.kind === "order_completed")!;
    expect(completed.title).toContain("Bought");
  });

  it("never notifies another customer", async () => {
    setNow("2026-11-17T10:00:00Z");
    const a = await readyCustomer("ntf-2a@v3st.test");
    const b = await signInCustomer("ntf-2b@v3st.test");
    const deposit = await makeOrder({ userId: a.userId, kind: "deposit", direction: "in", status: "settled", ngnAmount: 500_000n });
    await eventService.emit(db, a.userId, "order.updated", deposit.id, "settled");
    await notificationProjector.run();

    const inboxA = await listNotifications(a.cookie);
    expect(inboxA.items.length).toBeGreaterThan(0);
    const inboxB = await listNotifications(b.cookie);
    expect(inboxB.items).toEqual([]);
  });

  it("marks notifications read and counts unread in the session", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("ntf-3@v3st.test");
    const deposit = await makeOrder({ userId, kind: "deposit", direction: "in", status: "settled", ngnAmount: 500_000n });
    await eventService.emit(db, userId, "order.updated", deposit.id, "settled");
    await notificationProjector.run();

    const sessionRes = await callAppRoute(sessionGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/session`,
      cookie,
    });
    expect(sessionRes.status).toBe(200);
    expect(dataOf<AppSessionDto>(sessionRes.json)).toMatchObject({
      signed_in: true,
      unread_notifications: 1,
    });

    const readRes = await callAppRoute(notificationsReadPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/notifications/read`,
      cookie,
      body: { all: true },
    });
    expect(readRes.status).toBe(200);
    expect(dataOf<{ unread: number }>(readRes.json).unread).toBe(0);

    const inbox = await listNotifications(cookie);
    expect(inbox.items.every((n) => n.read)).toBe(true);
    const sessionRes2 = await callAppRoute(sessionGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/session`,
      cookie,
    });
    expect(dataOf<AppSessionDto>(sessionRes2.json)).toMatchObject({
      signed_in: true,
      unread_notifications: 0,
    });
  });

  it("streams changed areas without internal names", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("ntf-4@v3st.test");
    const deposit = await makeOrder({ userId, kind: "deposit", direction: "in", status: "settled", ngnAmount: 500_000n });

    const controller = new AbortController();
    const req = new NextRequest(`${ORIGIN}/api/v1/app/events`, {
      method: "GET",
      headers: { cookie },
      signal: controller.signal,
    });
    const res = await eventsGET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();

    await eventService.emit(db, userId, "order.updated", deposit.id, "settled");
    const { value } = await reader.read();
    const frame = new TextDecoder().decode(value);
    expect(frame).toContain("event: changed");
    expect(frame).toContain('"areas":["home","cash","activity"]');
    expect(frame).not.toContain("order.updated");
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
});
