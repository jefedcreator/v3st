import { expect, it } from "vitest";

import { buildMoneyLine, crossingId } from "@/components/app/home/line-model";
import type {
  AppActionItemDto,
  AppActivityItemDto,
  AppHomeDto,
  AppOrderDto,
  AppPayToDto,
} from "@/types/app";

const NOW = new Date("2026-11-19T13:20:00Z");

function home(overrides: Partial<AppHomeDto> = {}): AppHomeDto {
  const base: AppHomeDto = {
    greeting_name: null,
    total_kobo: null,
    total_status: "unavailable",
    as_of: NOW.toISOString(),
    change_24h_kobo: null,
    cash: { available_kobo: null, on_hold_kobo: null, incoming_kobo: null, as_of: NOW.toISOString() },
    invested_kobo: null,
    earn_kobo: null,
    earnings: { this_week_kobo: null, next_payout_on: "2026-11-20", choice: "unset" },
    holdings: [],
    open_orders: [],
    action_items: [],
    beta: { test_money: true, notice: "" },
  };
  return { ...base, ...overrides };
}

function payTo(expiresAt: string): AppPayToDto {
  return {
    bank_name: "Test Bank",
    account_number: "0123456789",
    account_name: "Ada Obi",
    reference: "ref",
    amount_kobo: "2000000",
    expires_at: expiresAt,
  };
}

function order(overrides: Partial<AppOrderDto> = {}): AppOrderDto {
  const base: AppOrderDto = {
    id: "ck1",
    reference: "ref-ck1",
    stock: { id: "stk1", name: "Tesla", ticker: "TSLA", logo_path: null },
    side: "buy",
    status: "waiting_for_price",
    title: "Waiting for prices to update",
    detail: "",
    amount_kobo: "2000000",
    shares_micro: null,
    price_kobo: null,
    pay_to: null,
    can_cancel: false,
    valid_until: null,
    timeline: [],
    created_at: NOW.toISOString(),
    completed_at: null,
  };
  return { ...base, ...overrides };
}

function act(overrides: Partial<AppActivityItemDto> = {}): AppActivityItemDto {
  const base: AppActivityItemDto = {
    id: "dep_ck1",
    kind: "add_money",
    title: "Money added",
    subtitle: "",
    amount_kobo: "100000",
    direction: "in",
    status: "completed",
    occurred_at: NOW.toISOString(),
    reference: "ref",
  };
  return { ...base, ...overrides };
}

it("is empty for a fresh account", () => {
  expect(buildMoneyLine(home(), [], NOW)).toEqual({ upcoming: [], earlier: [] });
});

it("puts action items nearest Now", () => {
  const setupItem: AppActionItemDto = {
    kind: "finish_setup",
    title: "Finish setting up",
    detail: "Choose a test identity.",
    link: "/setup",
  };
  const line = buildMoneyLine(home({ action_items: [setupItem] }), [], NOW);
  expect(line.upcoming.at(-1)).toMatchObject({
    title: "Finish setting up",
    tone: "action",
    href: "/setup",
  });
});

it("shows the Friday payout first when there is Earn value", () => {
  const h = home({
    earn_kobo: "477040",
    earnings: { this_week_kobo: "124000", next_payout_on: "2026-11-20", choice: "payout" },
  });
  const item = buildMoneyLine(h, [], NOW).upcoming[0]!;
  expect(item).toMatchObject({
    title: "Friday payout",
    detail: "₦1,240 so far this week · paid to your bank",
    href: "/earnings",
    tone: "waiting",
    due: "2026-11-20T07:00:00Z",
  });
});

it("sorts in-progress items by deadline, soonest nearest Now, and merges duplicates", () => {
  const a = order({
    id: "A",
    status: "waiting_for_price",
    valid_until: "2026-11-22T08:40:00Z",
  });
  const b = order({
    id: "B",
    side: "buy",
    status: "waiting_for_payment",
    pay_to: payTo("2026-11-19T13:44:00Z"),
  });
  const h = home({
    open_orders: [b, a],
    action_items: [
      {
        kind: "finish_transfer",
        title: "Finish your transfer",
        detail: "Send ₦20,000 to buy Tesla.",
        link: "/orders/B",
      },
    ],
  });
  const line = buildMoneyLine(h, [act({ id: "ord_A", status: "processing" })], NOW);
  expect(line.upcoming.map((i) => i.key)).toEqual(["order:A", "order:B"]);
  expect(line.upcoming[0]).toMatchObject({ title: "Buy Tesla", href: "/orders/A" });
});

it("keeps five finished items below Now, with failures marked", () => {
  const done = Array.from({ length: 7 }, (_, i) =>
    act({ id: `dep_${i}`, status: i === 0 ? "failed" : "completed" }),
  );
  const line = buildMoneyLine(home(), done, NOW);
  expect(line.earlier.map((i) => i.key)).toEqual([
    "activity:dep_0",
    "activity:dep_1",
    "activity:dep_2",
    "activity:dep_3",
    "activity:dep_4",
  ]);
  expect(line.earlier[0]!.tone).toBe("failed");
});

it("gives an order the same crossing id above and below Now", () => {
  const above = order({ id: "A", status: "processing" });
  const upcoming = buildMoneyLine(home({ open_orders: [above] }), [], NOW).upcoming[0]!;
  const earlier = buildMoneyLine(home(), [act({ id: "ord_A", status: "completed" })], NOW).earlier[0]!;
  expect(crossingId(upcoming.key)).toBe(crossingId(earlier.key));
  expect(crossingId("activity:dep_1")).toBe("activity:dep_1");
});

it("dates the Friday payout node", () => {
  const h = home({
    earn_kobo: "477040",
    earnings: { this_week_kobo: "124000", next_payout_on: "2026-11-20", choice: "payout" },
  });
  expect(buildMoneyLine(h, [], NOW).upcoming[0]!.amountText).toBe("Fri 20 Nov");
});
