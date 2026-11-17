import type {
  CustomerOrder,
  Earning,
  Investment,
  RampOrder,
  Strategy,
  StrategyPosition,
  UserEvent,
} from "@/server/prisma";
import { withTx, type Tx } from "@/server/db";
import { STOCK_PROFILES } from "@/backend/content/stock-profiles";
import { eventService } from "@/backend/services/events";
import { ratesService } from "@/backend/services/rates";
import { formatNaira, formatShares, sharesMicroOf, toKobo } from "@/backend/services/app/format";
import { fromDbRaw } from "@/utils/asset-units";
import type { Rate } from "@/utils/money";

export type NotificationSubject =
  | { kind: "ramp_order"; order: RampOrder; orderLinked: boolean }
  | {
      kind: "customer_order";
      order: CustomerOrder;
      stockName: string | null;
      sharesText: string;
      amountText: string;
    }
  | {
      kind: "investment";
      investment: Investment;
      stockName: string | null;
      amountText: string | null;
    }
  | {
      kind: "strategy_position";
      position: StrategyPosition;
      strategy: Strategy | null;
      stockName: string | null;
    }
  | { kind: "earning"; earning: Earning; stockName: string | null; amountText: string | null };

export type NotificationContent = { kind: string; title: string; body: string; link: string };

function stockName(stock: { displayTicker: string | null; name: string } | null): string | null {
  if (!stock) return null;
  const profile = stock.displayTicker ? STOCK_PROFILES[stock.displayTicker] : undefined;
  return profile?.name ?? stock.name;
}

async function payoutRateOrNull(): Promise<Rate | null> {
  try {
    return (await ratesService.display()).payoutRate;
  } catch {
    return null;
  }
}

// Loads the event's subject row and the display strings the copy needs; null when
// the subject is gone or belongs to another user.
async function loadSubject(tx: Tx, event: UserEvent): Promise<NotificationSubject | null> {
  switch (event.type) {
    case "order.updated": {
      const order = await tx.rampOrder.findUnique({ where: { id: event.subjectId } });
      if (order?.userId !== event.userId) return null;
      const linked = await tx.customerOrder.findFirst({
        where: { depositOrderId: order.id },
        select: { id: true },
      });
      return { kind: "ramp_order", order, orderLinked: linked !== null };
    }
    case "customer_order.updated": {
      const order = await tx.customerOrder.findUnique({ where: { id: event.subjectId } });
      if (order?.userId !== event.userId) return null;
      const stock = await tx.stock.findUnique({ where: { id: order.stockId } });
      const sharesMicro =
        order.quantityRaw === null ? null : sharesMicroOf(fromDbRaw(order.quantityRaw), stock?.decimals ?? 18);
      const buy = order.side === "buy";
      return {
        kind: "customer_order",
        order,
        stockName: stockName(stock),
        sharesText: sharesMicro === null ? "0 shares" : formatShares(sharesMicro),
        amountText: formatNaira(buy ? order.amountKobo : (order.settledKobo ?? order.amountKobo)),
      };
    }
    case "investment.updated": {
      const investment = await tx.investment.findUnique({ where: { id: event.subjectId } });
      if (investment?.userId !== event.userId) return null;
      const stock = await tx.stock.findUnique({ where: { id: investment.stockId } });
      const rate = await payoutRateOrNull();
      return {
        kind: "investment",
        investment,
        stockName: stockName(stock),
        amountText:
          rate === null ? null : formatNaira(toKobo(fromDbRaw(investment.amountIn), rate)),
      };
    }
    case "strategy.position.updated": {
      const position = await tx.strategyPosition.findUnique({ where: { id: event.subjectId } });
      if (position?.userId !== event.userId) return null;
      const strategy = await tx.strategy.findUnique({ where: { id: position.strategyId } });
      const prov = strategy?.provenance as { stockId?: string } | null;
      const stock = prov?.stockId ? await tx.stock.findUnique({ where: { id: prov.stockId } }) : null;
      return { kind: "strategy_position", position, strategy, stockName: stockName(stock) };
    }
    case "earning.recognized": {
      const earning = await tx.earning.findUnique({ where: { receiptId: event.subjectId } });
      if (earning?.userId !== event.userId) return null;
      const stock = earning.stockId ? await tx.stock.findUnique({ where: { id: earning.stockId } }) : null;
      const rate = await payoutRateOrNull();
      return {
        kind: "earning",
        earning,
        stockName: stockName(stock),
        amountText:
          rate === null ? null : formatNaira(toKobo(BigInt(earning.amountUsdc), rate)),
      };
    }
    default:
      return null;
  }
}

// Maps one user event to customer-facing notification copy; null means no notification.
export function notificationFor(event: UserEvent, subject: NotificationSubject): NotificationContent | null {
  const status = event.status ?? "";
  if (event.type === "order.updated" && subject.kind === "ramp_order") {
    const { order, orderLinked } = subject;
    const amount = formatNaira(order.ngnAmount);
    const fee = order.feeNgn ?? 0n;
    const net = formatNaira(order.netNgn ?? order.ngnAmount - fee);
    const bank = order.destBankName ?? "";
    const last4 = (order.destAccountNumber ?? "").slice(-4);
    if (order.kind === "deposit" && status === "settled" && !orderLinked) {
      return { kind: "money_added", title: "Money added", body: `${amount} is in your cash.`, link: "/cash" };
    }
    if (order.kind === "deposit" && status === "expired" && !orderLinked) {
      return {
        kind: "transfer_closed",
        title: "Transfer window closed",
        body: `We didn't receive ${amount}. Nothing was charged.`,
        link: "/cash",
      };
    }
    if (order.kind === "deposit" && status === "refunded") {
      return {
        kind: "transfer_returned",
        title: "Transfer returned",
        body: `We sent ${amount} back to the account it came from.`,
        link: "/cash",
      };
    }
    if (order.kind === "withdrawal" && status === "paid") {
      return {
        kind: "money_sent",
        title: "Money sent",
        body: `${net} is on its way to ${bank} ••${last4}.`,
        link: `/activity/wd_${order.id}`,
      };
    }
    if (order.kind === "earnings_payout" && status === "paid") {
      return {
        kind: "earnings_paid",
        title: "Your earnings were paid",
        body: `${net} is on its way to ${bank} ••${last4}.`,
        link: "/earnings",
      };
    }
    if ((order.kind === "withdrawal" || order.kind === "earnings_payout") && status === "reversed") {
      return {
        kind: "withdrawal_returned",
        title: "Withdrawal returned",
        body: `Your bank couldn't accept ${amount}. It's back in your cash.`,
        link: "/cash",
      };
    }
    return null;
  }
  if (event.type === "customer_order.updated" && subject.kind === "customer_order") {
    const { order, stockName, sharesText, amountText } = subject;
    const name = stockName ?? "your stock";
    const buy = order.side === "buy";
    const link = `/orders/${order.id}`;
    if (status === "completed") {
      return {
        kind: "order_completed",
        title: `${buy ? "Bought" : "Sold"} ${name}`,
        body: `${sharesText} for ${amountText}.`,
        link,
      };
    }
    if (status === "failed") {
      return {
        kind: "order_failed",
        title: "Order didn't go through",
        body: buy ? "Your money is back in your cash." : "Your shares are still yours.",
        link,
      };
    }
    if (status === "waiting_for_price") {
      return {
        kind: "order_waiting",
        title: buy ? "We'll buy when prices update" : "We'll sell when prices update",
        body: `Your ${name} order goes through at the next price update.`,
        link,
      };
    }
    if (status === "expired") {
      return {
        kind: "order_expired",
        title: "Order expired",
        body: buy ? "Your money is in your cash." : "Your shares are still yours.",
        link,
      };
    }
    return null;
  }
  if (event.type === "investment.updated" && subject.kind === "investment") {
    const { investment, stockName, amountText } = subject;
    if (investment.purpose !== "reinvest" || status !== "filled" || amountText === null) return null;
    return {
      kind: "reinvested",
      title: "Earnings reinvested",
      body: `${amountText} went into ${stockName ?? "your chosen stock"}.`,
      link: "/earnings",
    };
  }
  if (event.type === "strategy.position.updated" && subject.kind === "strategy_position") {
    const { strategy, stockName } = subject;
    const name = stockName ?? "your pool";
    const productId = strategy?.id ?? "";
    if (status === "active") {
      return {
        kind: "earn_joined",
        title: `You're earning from ${name}`,
        body: "We'll collect your fees every week.",
        link: `/earn/${productId}`,
      };
    }
    if (status === "exited") {
      return {
        kind: "earn_withdrawn",
        title: "Earn withdrawal complete",
        body: `Your ${name} shares and cash are back in your account.`,
        link: `/earn/${productId}`,
      };
    }
    return null;
  }
  if (event.type === "earning.recognized" && subject.kind === "earning") {
    const { earning, stockName, amountText } = subject;
    if (BigInt(earning.amountUsdc) <= 0n || amountText === null) return null;
    return {
      kind: "earned",
      title: `You earned ${amountText}`,
      body: `From ${stockName ?? "your Earn pool"} trading fees.`,
      link: "/earnings",
    };
  }
  return null;
}

const PROJECTOR_LOCK = 72_101;
const CURSOR_NAME = "notifications";
const BATCH = 500;

class NotificationProjector {
  // Projects user events into notifications exactly once per (type, subject,
  // status), all inside one transaction guarded by an advisory lock.
  async run(): Promise<{ processed: number; created: number }> {
    return withTx(
      async (tx) => {
        const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_lock(${PROJECTOR_LOCK}) AS locked
        `;
        if (!lockRows[0]?.locked) return { processed: 0, created: 0 };
        const cursorRow = await tx.projectionCursor.findUnique({ where: { name: CURSOR_NAME } });
        const position = cursorRow?.position ?? 0n;
        const events = await tx.userEvent.findMany({
          where: { seq: { gt: position } },
          orderBy: { seq: "asc" },
          take: BATCH,
        });
        const pending: { event: UserEvent; content: NotificationContent; dedupeKey: string }[] = [];
        for (const event of events) {
          if (event.type === "notification.created") continue;
          const subject = await loadSubject(tx, event);
          if (!subject) continue;
          const content = notificationFor(event, subject);
          if (!content) continue;
          pending.push({
            event,
            content,
            dedupeKey: `${event.type}:${event.subjectId}:${event.status ?? ""}`,
          });
        }
        const existing = await tx.notification.findMany({
          where: { dedupeKey: { in: pending.map((p) => p.dedupeKey) } },
          select: { dedupeKey: true },
        });
        const seen = new Set(existing.map((row) => row.dedupeKey));
        const fresh = pending.filter((p) => !seen.has(p.dedupeKey));
        if (fresh.length > 0) {
          await tx.notification.createMany({
            data: fresh.map((p) => ({
              userId: p.event.userId,
              kind: p.content.kind,
              title: p.content.title,
              body: p.content.body,
              link: p.content.link,
              dedupeKey: p.dedupeKey,
            })),
            skipDuplicates: true,
          });
          for (const p of fresh) {
            await eventService.emit(tx, p.event.userId, "notification.created", p.dedupeKey, null);
          }
        }
        const lastSeq = events.length > 0 ? events[events.length - 1]!.seq : position;
        await tx.projectionCursor.upsert({
          where: { name: CURSOR_NAME },
          create: { name: CURSOR_NAME, position: lastSeq },
          update: { position: lastSeq },
        });
        return { processed: events.length, created: fresh.length };
      },
      { timeoutMs: 30_000 },
    );
  }
}

export const notificationProjector = new NotificationProjector();
