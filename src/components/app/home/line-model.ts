import {
  formatLagosDateTime,
  formatLagosDay,
  formatLagosTime,
  formatNaira,
  formatSignedNaira,
  lagosDayLabel,
} from "@/utils/format";
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
  // The right-hand figure: an amount, or the payout date on the Friday node.
  amountText: string | null;
  tone: LineTone;
  href: string;
  due: string | null;
};

export type MoneyLineModel = { upcoming: LineItem[]; earlier: LineItem[] };

// The id a row keeps while it crosses Now. An open order is listed as
// `order:{id}` above the marker and lands below it as its activity item,
// `activity:ord_{id}`; both share one id so the row slides across instead
// of vanishing and reappearing.
export function crossingId(key: string): string {
  if (key.startsWith("order:")) return `activity:ord_${key.slice("order:".length)}`;
  return key;
}

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

// Time left on a deadline at the minute the line was drawn, or null once due.
export function timeLeft(due: string, now: Date): string | null {
  const minutes = Math.ceil((new Date(due).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

// When it happened, in Lagos: "Today, 19:09", "Yesterday, 08:15", "Mon 16 Nov, 12:00".
function happenedAt(iso: string, now: Date): string {
  return `${lagosDayLabel(iso, now)}, ${formatLagosTime(iso)}`;
}

function orderItem(order: AppOrderDto, now: Date): LineItem {
  let detail = order.title;
  if (order.status === "waiting_for_price" && order.valid_until !== null) {
    detail = `${detail} · until ${formatLagosDateTime(order.valid_until)}`;
  }
  if (order.status === "waiting_for_payment" && order.pay_to?.expires_at) {
    const left = timeLeft(order.pay_to.expires_at, now);
    if (left !== null) detail = `${detail} · ${left}`;
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

// An activity row; a finished one says when it happened before what it was,
// and one still waiting on a transfer counts down to its deadline.
function activityItem(
  item: AppActivityItemDto,
  now: Date,
  finished: boolean,
  deadline: string | null = null,
): LineItem {
  let detail = item.subtitle;
  if (finished) {
    const when = happenedAt(item.occurred_at, now);
    detail = detail === "" ? when : `${when} · ${detail}`;
  } else if (deadline !== null) {
    const left = timeLeft(deadline, now);
    if (left !== null) detail = detail === "" ? left : `${detail} · ${left}`;
  }
  return {
    key: `activity:${item.id}`,
    title: item.title,
    detail,
    amountText:
      item.amount_kobo === null ? null : formatSignedNaira(item.amount_kobo, item.direction),
    tone: PROGRESS_TONES[item.status],
    href: `/activity/${item.id}`,
    due: finished ? null : deadline,
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
// The API's statuses decide which side an item is on; `now` dates finished
// rows and counts down deadlines. `minPayoutKobo` (policy) keeps the Friday
// node from promising a payout that will roll over. `transferDeadlines` maps
// an unpaid transfer's activity id to its deposit's `pay_to.expires_at`,
// which the activity feed itself does not carry.
export function buildMoneyLine(
  home: AppHomeDto,
  activity: AppActivityItemDto[],
  now: Date,
  minPayoutKobo?: string,
  transferDeadlines: Readonly<Record<string, string>> = {},
): MoneyLineModel {
  const upcoming: LineItem[] = [];

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
    } else if (
      home.earnings.choice === "payout" &&
      minPayoutKobo !== undefined &&
      BigInt(home.earnings.this_week_kobo) < BigInt(minPayoutKobo)
    ) {
      detail = `${formatNaira(home.earnings.this_week_kobo)} so far this week · payouts start at ${formatNaira(minPayoutKobo)}`;
    } else {
      const marker = home.earnings.choice === "payout" ? "paid to your bank" : "reinvested";
      detail = `${formatNaira(home.earnings.this_week_kobo)} so far this week · ${marker}`;
    }
    upcoming.push({
      key: "friday",
      title: "Friday payout",
      detail,
      amountText: formatLagosDay(home.earnings.next_payout_on),
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
      inProgress.push(orderItem(order, now));
    }
  }
  for (const item of activity) {
    if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") continue;
    if (item.id.startsWith("ord_")) {
      const orderId = item.id.slice("ord_".length);
      if (listedOrders.has(orderId)) continue;
    }
    inProgress.push(activityItem(item, now, false, transferDeadlines[item.id] ?? null));
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
    earlier.push(activityItem(item, now, true));
    if (earlier.length === 5) break;
  }

  return { upcoming, earlier };
}
