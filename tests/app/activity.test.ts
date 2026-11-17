import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { GET as activityGET } from "@/app/api/v1/app/activity/route";
import { GET as activityItemGET } from "@/app/api/v1/app/activity/[id]/route";
import type {
  AppActivityDetailDto,
  AppActivityItemDto,
  AppActivityPageDto,
} from "@/backend/services/app/activity";
import { now } from "@/backend/clock";
import { db } from "@/server/db";
import { toDbRaw } from "@/utils/asset-units";

import { callAppRoute, ORIGIN, readyCustomer, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { makeOrder, makeStock } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

async function listActivity(cookie: string, query?: { cursor?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return callAppRoute(activityGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/activity${qs ? `?${qs}` : ""}`,
    cookie,
  });
}

async function getActivity(cookie: string, id: string) {
  return callAppRoute(activityItemGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/activity/${id}`,
    cookie,
    params: { id },
  });
}

async function makeCustomerOrder(
  userId: string,
  stockId: string,
  overrides?: Partial<{
    side: "buy" | "sell";
    status: "completed" | "failed" | "waiting_for_payment";
    funding: "cash" | "bank_transfer";
    depositOrderId: string | null;
    createdAt: Date;
    amountKobo: bigint;
  }>,
) {
  const preview = await db.customerOrderPreview.create({
    data: {
      userId,
      stockId,
      side: overrides?.side ?? "buy",
      funding: overrides?.funding ?? null,
      mode: "now",
      amountKobo: overrides?.amountKobo ?? 100_000n,
      referencePriceMicroUsd: 2_000_000n,
      limitPriceMicroUsd: 2_100_000n,
      rateKobo: 160_000n,
      rateMicroUsd: 1_000_000n,
      terms: { fees: [{ label: "Trading fee", kobo: null, note: "Up to 1%" }] },
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
      side: overrides?.side ?? "buy",
      funding: overrides?.funding ?? null,
      status: overrides?.status ?? "completed",
      amountKobo: overrides?.amountKobo ?? 100_000n,
      limitPriceMicroUsd: 2_100_000n,
      rateKobo: 160_000n,
      rateMicroUsd: 1_000_000n,
      quantityRaw: toDbRaw(50_000n * 10n ** 6n),
      depositOrderId: overrides?.depositOrderId ?? null,
      expiresAt: new Date(now().getTime() + 60_000),
      completedAt: overrides?.status === "failed" ? null : now(),
      createdAt: overrides?.createdAt ?? now(),
    },
  });
}

describe("customer activity feed", () => {
  it("lists a customer's money events newest first in plain words", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("act-1@v3st.test");
    const stock = await makeStock();
    await makeOrder({
      userId,
      kind: "deposit",
      direction: "in",
      status: "settled",
      ngnAmount: 500_000n,
      feeNgn: 100n,
      createdAt: new Date("2026-11-17T09:00:00Z"),
    });
    await makeCustomerOrder(userId, stock.id, { createdAt: new Date("2026-11-17T09:30:00Z") });
    await makeOrder({
      userId,
      kind: "withdrawal",
      direction: "out",
      status: "paid",
      ngnAmount: 200_000n,
      feeNgn: 50n,
      createdAt: new Date("2026-11-17T09:45:00Z"),
    });

    const res = await listActivity(cookie);
    expect(res.status).toBe(200);
    const page = dataOf<AppActivityPageDto>(res.json);
    expect(page.items.map((i) => i.kind)).toEqual(["withdrawal", "buy", "add_money"]);
    expect(page.items[2]!.title).toBe("Money added");
    expect(page.items[2]!.direction).toBe("in");
    expect(page.items[2]!.amount_kobo).toBe("500000");
    expect(page.next_cursor).toBeNull();
  });

  it("shows a transfer made for an order only inside that order", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("act-2@v3st.test");
    const stock = await makeStock();
    const transfer = await makeOrder({
      userId,
      kind: "deposit",
      direction: "in",
      status: "settled",
      ngnAmount: 100_000n,
      createdAt: new Date("2026-11-17T09:10:00Z"),
    });
    await makeCustomerOrder(userId, stock.id, {
      funding: "bank_transfer",
      depositOrderId: transfer.id,
      createdAt: new Date("2026-11-17T09:10:30Z"),
    });

    const res = await listActivity(cookie);
    const page = dataOf<AppActivityPageDto>(res.json);
    expect(page.items.map((i) => i.kind)).toEqual(["buy"]);
    const detail = await getActivity(cookie, page.items[0]!.id);
    expect(detail.status).toBe(200);
    expect(dataOf<AppActivityDetailDto>(detail.json).kind).toBe("buy");
  });

  it("pages without duplicates", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("act-3@v3st.test");
    for (let i = 0; i < 25; i += 1) {
      await makeOrder({
        userId,
        kind: "deposit",
        direction: "in",
        status: "settled",
        ngnAmount: BigInt(100_000 + i),
        createdAt: new Date(Date.UTC(2026, 10, 17, 8, 0, 0) + i * 60_000),
      });
    }
    const page1Res = await listActivity(cookie);
    const page1 = dataOf<AppActivityPageDto>(page1Res.json);
    expect(page1.items).toHaveLength(20);
    expect(page1.next_cursor).toBeTruthy();

    // A brand-new event lands between page 1 and page 2.
    await makeOrder({
      userId,
      kind: "withdrawal",
      direction: "out",
      status: "funded",
      ngnAmount: 999_999n,
      createdAt: new Date("2026-11-17T09:59:00Z"),
    });

    const page2Res = await listActivity(cookie, { cursor: page1.next_cursor! });
    expect(page2Res.status).toBe(200);
    const page2 = dataOf<AppActivityPageDto>(page2Res.json);
    expect(page2.items).toHaveLength(5);
    expect(page2.next_cursor).toBeNull();
    const ids = [...page1.items.map((i) => i.id), ...page2.items.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(page2.items.some((i) => i.amount_kobo === "999999")).toBe(false);
  });

  it("hides another customer's activity", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { userId } = await readyCustomer("act-4@v3st.test");
    const deposit = await makeOrder({ userId, kind: "deposit", direction: "in", status: "settled" });
    const other = await signInCustomer("act-4-other@v3st.test");
    const res = await getActivity(other.cookie, `dep_${deposit.id}`);
    expect(res.status).toBe(404);
    expect((res.json as { code: string }).code).toBe("NOT_FOUND");
  });

  it("describes a failed buy without internal words", async () => {
    setNow("2026-11-17T10:00:00Z");
    const { cookie, userId } = await readyCustomer("act-5@v3st.test");
    const stock = await makeStock();
    await makeCustomerOrder(userId, stock.id, { status: "failed" });

    const res = await listActivity(cookie);
    const page = dataOf<AppActivityPageDto>(res.json);
    expect(page.items).toHaveLength(1);
    const item: AppActivityItemDto = page.items[0]!;
    expect(item.kind).toBe("buy");
    expect(item.status).toBe("failed");
    expect(item.title).toBe("Order didn't go through");

    const detail = await getActivity(cookie, item.id);
    expect(detail.status).toBe(200);
    const detailDto = dataOf<AppActivityDetailDto>(detail.json);
    expect(detailDto.lines.map((l) => l.label)).toEqual([
      "Amount",
      "Shares",
      "Price per share",
      "Trading fee",
    ]);
    expect(detailDto.timeline.length).toBeGreaterThan(0);
  });
});
