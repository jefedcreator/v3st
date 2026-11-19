import { formatLagosDateTime, formatNaira, formatSignedNaira } from "@/utils/format";
import type {
  AppActivityItemDto,
  AppHomeDto,
  AppActionItemDto,
  AppOrderDto,
  AppProgress,
} from "@/types/app";

export type LineTone = "waiting" | "processing" | "action" | "done" | "failed" | "ended";

export type LineItem = {
  key: string;
  title: string;
  detail: string;
  amountText: string | null;
  tone: LineTone;
  href: string;
  due: string | null;
};

export type MoneyLineModel = { upcoming: LineItem[]; earlier: LineItem[] };

const WAITING_ORDER_STATUSES = new Set(["waiting_for_payment", "waiting_for_price"]);
const PROGRESS_TONES: Record<AppProgress, LineTone> = {
  waiting: "waiting",
  processing: "processing",
  action_needed: "action",
  completed: "done",
  failed: "failed",
  cancelled: "ended",
};
const EARLIER_STATUSES = new Set(["completed", "failed", "cancelled"]);

function orderItem(order: AppOrderDto): LineItem {
  let detail = order.title;
  if (order.status === "waiting_for_price" && order.valid_until !== null) {
    detail = `${detail} · until ${formatLagosDateTime(order.valid_until)}`;
  }
  const tone: LineTone = WAITING_ORDER_STATUSES.has(order.status) ? "waiting" : "processing";
  const due = order.valid_until ?? order.pay_to?.expires_at ?? null;
  return {
    key: `order:${order.id}`,
    title: `${order.side === "buy" ? "Buy" : "Sell"} ${order.stock.name}`,
    detail,
    amountText: order.amount_kobo === null ? null : formatNaira(order.amount_kobo),
    tone,
    href: `/orders/${order.id}`,
    due,
  };
}

function activityItem(item: AppActivityItemDto): LineItem {
  return {
    key: `activity:${item.id}`,
    title: item.title,
    detail: item.subtitle,
    amountText:
      item.amount_kobo === null ? null : formatSignedNaira(item.amount_kobo, item.direction),
    tone: PROGRESS_TONES[item.status],
    href: `/activity/${item.id}`,
    due: null,
  };
}

function actionItem(item: AppActionItemDto): LineItem {
  return {
    key: `action:${item.kind}:${item.link}`,
    title: item.title,
    detail: item.detail,
    amountText: null,
    tone: "action",
    href: item.link,
    due: null,
  };
}

// Home's money line, exactly: what is coming above Now, what is done below.
export function buildMoneyLine(
  home: AppHomeDto,
  activity: AppActivityItemDto[],
  now: Date,
): MoneyLineModel {

  void now;  const upcoming: LineItem[] = [];

  // 1. The Friday payout node is always first when there is Earn value.
  const hasEarnValue =
    (home.earn_kobo !== null && home.earn_kobo !== "0") ||
    (home.earnings.this_week_kobo !== null && home.earnings.this_week_kobo !== "0");
  if (hasEarnValue) {
    let detail: string;
    if (home.earnings.this_week_kobo === null) {
      detail = "This week's earnings aren't available right now";
    } else if (home.earnings.choice === "unset") {
      detail = "Choose what happens to your earnings";
    } else {
      const marker = home.earnings.choice === "payout" ? "paid to your bank" : "reinvested";
      detail = `${formatNaira(home.earnings.this_week_kobo)} so far this week · ${marker}`;
    }
    upcoming.push({
      key: "friday",
      title: "Friday payout",
      detail,
      amountText: null,
      tone: "waiting",
      href: "/earnings",
      due: `${home.earnings.next_payout_on}T07:00:00Z`,
    });
  }

  // 2. In progress: open orders, then live activity, sorted by deadline.
  const listedOrders = new Set(
    home.open_orders
      .filter(
        (order) =>
          WAITING_ORDER_STATUSES.has(order.status) || order.status === "processing",
      )
      .map((order) => order.id),
  );
  const inProgress: LineItem[] = [];
  for (const order of home.open_orders) {
    if (WAITING_ORDER_STATUSES.has(order.status) || order.status === "processing") {
      inProgress.push(orderItem(order));
    }
  }
  for (const item of activity) {
    if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") continue;
    if (item.id.startsWith("ord_")) {
      const orderId = item.id.slice("ord_".length);
      if (listedOrders.has(orderId)) continue;
    }
    inProgress.push(activityItem(item));
  }
  inProgress.sort((a, b) => {
    if (a.due === null && b.due === null) return 0;
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return new Date(b.due).getTime() - new Date(a.due).getTime();
  });
  upcoming.push(...inProgress);

  // 3. Needs you: the remaining action items, with merged transfers dropped.
  const linkedOrders = new Set(
    home.action_items
      .filter((item) => item.kind === "finish_transfer")
      .map((item) => item.link.replace("/orders/", ""))
      .filter((orderId) => listedOrders.has(orderId)),
  );
  for (const item of home.action_items) {
    if (item.kind === "finish_transfer" && linkedOrders.has(item.link.replace("/orders/", ""))) continue;
    upcoming.push(actionItem(item));
  }

  // Earlier: done activity, feed order kept, five at most.
  const earlier: LineItem[] = [];
  for (const item of activity) {
    if (!EARLIER_STATUSES.has(item.status)) continue;
    earlier.push(activityItem(item));
    if (earlier.length === 5) break;
  }

  return { upcoming, earlier };
}
