import type { OnchainOperation } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import {
  depositProgress,
  withdrawalProgress,
  type AppBankAccountDto,
} from "@/backend/services/app/cash";
import { appCatalogService } from "@/backend/services/app/catalog";
import {
  customerReference,
  formatNaira,
  formatShares,
  sharesMicroOf,
  toKobo,
} from "@/backend/services/app/format";
import { orderSharesRaw, orderView, type AppOrderStatus } from "@/backend/services/app/orders";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { earningsService } from "@/backend/services/earnings";
import { unpack } from "@/backend/services/execution";
import { ratesService } from "@/backend/services/rates";
import type { AppProgress } from "@/types/app";
import { effectiveSharePriceMicroUsd } from "@/backend/services/stocks/reference";
import { fromDbRaw, fromDbRawNullable } from "@/utils/asset-units";
import { NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";
import type { Rate } from "@/utils/money";
import type { AppActivityKind, AppActivityItemDto, AppActivityDetailDto, AppActivityPageDto } from "@/types/app";

export type { AppActivityKind, AppActivityItemDto, AppActivityDetailDto, AppActivityPageDto } from "@/types/app";

type ActivityRow = {
  id: string;
  kind: AppActivityKind;
  title: string;
  subtitle: string;
  amountKobo: bigint | null;
  direction: "in" | "out" | "none";
  status: AppProgress;
  occurredAt: Date;
  reference: string;
};

type Cursor = { at: Date; id: string };

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id]), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new UnprocessableEntityException("Invalid cursor", "VALIDATION_FAILED");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new UnprocessableEntityException("Invalid cursor", "VALIDATION_FAILED");
  }
  const at = new Date(parsed[0]);
  if (Number.isNaN(at.getTime())) {
    throw new UnprocessableEntityException("Invalid cursor", "VALIDATION_FAILED");
  }
  return { at, id: parsed[1] };
}

function olderThan(row: ActivityRow, cursor: Cursor): boolean {
  const rowTime = row.occurredAt.getTime();
  const cursorTime = cursor.at.getTime();
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return row.id < cursor.id;
}

function sortDesc(rows: ActivityRow[]): ActivityRow[] {
  return rows.sort((a, b) => {
    const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id < b.id ? 1 : -1;
  });
}

// The week's Sunday 23:59:59.999 Lagos time (UTC+1), when the earning week closes.
function weekCloseLagos(week: string): Date {
  const parts = week.split("-").map((v) => Number(v));
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(Date.UTC(y, m - 1, d + 6, 22, 59, 59, 999));
}

function progressOfOrderStatus(status: AppOrderStatus): AppProgress {
  if (status === "waiting_for_payment" || status === "waiting_for_price") return "waiting";
  if (status === "expired") return "cancelled";
  return status;
}

function opStatus(op: OnchainOperation): AppProgress {
  if (op.status === "finalized") return "completed";
  if (op.status === "reverted" || op.status === "failed") return "failed";
  return "processing";
}

function opAction(op: OnchainOperation): string | null {
  const expected = unpack(op.expected) as { quote?: { request?: { action?: string } } };
  return expected?.quote?.request?.action ?? null;
}

async function payoutRateOrNull(): Promise<Rate | null> {
  try {
    return (await ratesService.display()).payoutRate;
  } catch {
    return null;
  }
}

function koboOf(microUsd: bigint, rate: Rate | null): bigint | null {
  return rate === null ? null : toKobo(microUsd, rate);
}

class AppActivityService {
  private async depositRows(userId: string): Promise<ActivityRow[]> {
    const orders = await db.customerOrder.findMany({
      where: { userId, depositOrderId: { not: null } },
      select: { depositOrderId: true },
    });
    const referenced = new Set(orders.map((o) => o.depositOrderId!));
    const rows = await db.rampOrder.findMany({ where: { userId, kind: "deposit" } });
    return rows
      .filter((order) => !referenced.has(order.id))
      .map((order) => {
        const { status, title } = depositProgress(order);
        return {
          id: `dep_${order.id}`,
          kind: "add_money" as const,
          title,
          subtitle: `Transfer of ${formatNaira(order.ngnAmount)}`,
          amountKobo: order.ngnAmount,
          direction: "in" as const,
          status,
          occurredAt: order.createdAt,
          reference: customerReference(order.id),
        };
      });
  }

  private async withdrawalRows(userId: string): Promise<ActivityRow[]> {
    const rows = await db.rampOrder.findMany({ where: { userId, kind: { in: ["withdrawal", "earnings_payout"] } } });
    const active = await bankAccountService.getActiveRow(userId);
    return rows.map((order) => {
      const to: AppBankAccountDto = {
        bank_name: order.destBankName ?? active?.bankName ?? "",
        account_ending: (order.destAccountNumber ?? active?.accountNumber ?? "").slice(-4),
        account_name: order.destAccountName ?? active?.resolvedName ?? "",
      };
      const payout = order.kind === "earnings_payout";
      const { status, title } = withdrawalProgress(order, to);
      return {
        id: payout ? `pay_${order.id}` : `wd_${order.id}`,
        kind: payout ? "earnings_payout" : "withdrawal",
        title: payout ? (order.status === "paid" ? "Earnings paid to your bank" : "Sending earnings to your bank") : title,
        subtitle: `To ${to.bank_name} ••${to.account_ending}`,
        amountKobo: order.ngnAmount,
        direction: "out" as const,
        status,
        occurredAt: order.createdAt,
        reference: customerReference(order.id),
      };
    });
  }

  private async orderRows(userId: string): Promise<ActivityRow[]> {
    const orders = await db.customerOrder.findMany({ where: { userId } });
    const rows: ActivityRow[] = [];
    for (const order of orders) {
      const stock = await db.stock.findUnique({ where: { id: order.stockId } });
      if (!stock) continue;
      const investment = order.investmentId
        ? await db.investment.findUnique({ where: { id: order.investmentId } })
        : null;
      const deposit = order.depositOrderId
        ? await db.rampOrder.findUnique({ where: { id: order.depositOrderId } })
        : null;
      const view = orderView(order, investment, deposit, stock);
      const buy = order.side === "buy";
      rows.push({
        id: `ord_${order.id}`,
        kind: buy ? "buy" : "sell",
        title: view.title,
        subtitle: view.detail,
        amountKobo: buy ? order.amountKobo : (order.settledKobo ?? order.amountKobo),
        direction: buy ? "out" : "in",
        status: progressOfOrderStatus(view.status),
        occurredAt: order.createdAt,
        reference: customerReference(order.id),
      });
    }
    return rows;
  }

  private async reinvestRows(userId: string, rate: Rate | null): Promise<ActivityRow[]> {
    const investments = await db.investment.findMany({ where: { userId, purpose: "reinvest" } });
    const rows: ActivityRow[] = [];
    for (const inv of investments) {
      const stock = await db.stock.findUnique({ where: { id: inv.stockId } });
      const name = stock ? appCatalogService.stockRef(stock).name : "your chosen stock";
      const kobo = koboOf(fromDbRaw(inv.amountIn), rate);
      let status: AppProgress = "processing";
      if (inv.status === "filled" || inv.status === "partial") status = "completed";
      else if (inv.status === "failed" || inv.status === "cancelled") status = "failed";
      rows.push({
        id: `inv_${inv.id}`,
        kind: "reinvest",
        title: `Reinvested in ${name}`,
        subtitle: kobo === null ? "From your earnings" : `${formatNaira(kobo)} from your earnings`,
        amountKobo: kobo,
        direction: "none",
        status,
        occurredAt: inv.createdAt,
        reference: customerReference(inv.id),
      });
    }
    return rows;
  }

  private async earnOpRows(userId: string, rate: Rate | null): Promise<ActivityRow[]> {
    const ops = await db.onchainOperation.findMany({ where: { userId, kind: "strategy" } });
    const rows: ActivityRow[] = [];
    for (const op of ops) {
      const action = opAction(op);
      if (action !== "enter" && action !== "exit") continue;
      const position = await db.strategyPosition.findUnique({ where: { operationId: op.id } });
      const strategy = await db.strategy.findUnique({ where: { id: position?.strategyId ?? "" } });
      const prov = strategy?.provenance as { stockId?: string } | null;
      const stock = prov?.stockId ? await db.stock.findUnique({ where: { id: prov.stockId } }) : null;
      const name = stock ? appCatalogService.stockRef(stock).name : "your pool";
      const micro = position
        ? action === "enter"
          ? fromDbRaw(position.principalUsdc)
          : fromDbRaw(position.valueUsdc ?? position.principalUsdc)
        : 0n;
      const kobo = koboOf(micro, rate);
      rows.push({
        id: `eop_${op.id}`,
        kind: action === "enter" ? "earn_join" : "earn_withdraw",
        title: action === "enter" ? `Joined Earn on ${name}` : `Withdrew from Earn on ${name}`,
        subtitle: kobo === null ? "" : `${formatNaira(kobo)}`,
        amountKobo: kobo,
        direction: action === "enter" ? "out" : "in",
        status: opStatus(op),
        occurredAt: op.createdAt,
        reference: customerReference(op.id),
      });
    }
    return rows;
  }

  private async earningWeekRows(userId: string, rate: Rate | null): Promise<ActivityRow[]> {
    const earnings = await db.earning.findMany({ where: { userId } });
    const byWeek = new Map<string, bigint>();
    for (const row of earnings) {
      byWeek.set(row.week, (byWeek.get(row.week) ?? 0n) + BigInt(row.amountUsdc));
    }
    let weekStatus = new Map<string, { status: string; detail: string }>();
    try {
      const weeks = await earningsService.list(userId, { page: 1, size: 100 });
      const currentWeek = lagosWeek(now());
      weekStatus = new Map(
        weeks.data.map((w) => {
          let detail: string;
          if (w.status === "paid") detail = "Paid to your bank";
          else if (w.status === "reinvested") detail = "Reinvested in your chosen stock";
          else if (w.status === "mixed") detail = "Partly paid, partly reinvested";
          else if (w.week === currentWeek) detail = "Pays out on Friday";
          else detail = "Below ₦2,000, so it rolls over";
          return [w.week, { status: w.status, detail }];
        }),
      );
    } catch {
      weekStatus = new Map();
    }
    const rows: ActivityRow[] = [];
    for (const [week, total] of byWeek) {
      if (total <= 0n) continue;
      const kobo = koboOf(total, rate);
      const info = weekStatus.get(week);
      rows.push({
        id: `wk_${week}`,
        kind: "earnings",
        title: "Weekly earnings",
        subtitle: info?.detail ?? "Earnings collected",
        amountKobo: kobo,
        direction: "in",
        status: "completed",
        occurredAt: weekCloseLagos(week),
        reference: customerReference(`wk_${week}`),
      });
    }
    return rows;
  }

  private async allSources(userId: string, rate: Rate | null): Promise<ActivityRow[][]> {
    return [
      await this.depositRows(userId),
      await this.withdrawalRows(userId),
      await this.orderRows(userId),
      await this.reinvestRows(userId, rate),
      await this.earnOpRows(userId, rate),
      await this.earningWeekRows(userId, rate),
    ];
  }

  private toItem(row: ActivityRow): AppActivityItemDto {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      subtitle: row.subtitle,
      amount_kobo: row.amountKobo === null ? null : row.amountKobo.toString(),
      direction: row.direction,
      status: row.status,
      occurred_at: row.occurredAt.toISOString(),
      reference: row.reference,
    };
  }

  async list(
    userId: string,
    input: { cursor?: string; limit?: number },
  ): Promise<AppActivityPageDto> {
    const limit = input.limit ?? 20;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rate = await payoutRateOrNull();
    const sources = await this.allSources(userId, rate);
    const merged: ActivityRow[] = [];
    for (const rows of sources) {
      const older = cursor ? rows.filter((row) => olderThan(row, cursor)) : rows;
      merged.push(...sortDesc(older).slice(0, limit + 1));
    }
    const page = sortDesc(merged).slice(0, limit);
    const nextCursor = merged.length > limit ? encodeCursor(page[page.length - 1]!.occurredAt, page[page.length - 1]!.id) : null;
    return { items: page.map((row) => this.toItem(row)), next_cursor: nextCursor };
  }

  async get(userId: string, id: string): Promise<AppActivityDetailDto> {
    const rate = await payoutRateOrNull();
    if (id.startsWith("dep_")) return this.depositDetail(userId, id.slice(4));
    if (id.startsWith("wd_")) return this.withdrawalDetail(userId, id.slice(3), "withdrawal");
    if (id.startsWith("pay_")) return this.withdrawalDetail(userId, id.slice(4), "earnings_payout");
    if (id.startsWith("ord_")) return this.orderDetail(userId, id.slice(4));
    if (id.startsWith("inv_")) return this.reinvestDetail(userId, id.slice(4), rate);
    if (id.startsWith("eop_")) return this.earnOpDetail(userId, id.slice(4), rate);
    if (id.startsWith("wk_")) return this.weekDetail(userId, id.slice(3), rate);
    throw new NotFoundException("Activity not found");
  }

  private async depositDetail(userId: string, orderId: string): Promise<AppActivityDetailDto> {
    const order = await db.rampOrder.findUnique({ where: { id: orderId } });
    if (order?.userId !== userId || order?.kind !== "deposit") {
      throw new NotFoundException("Activity not found");
    }
    const referenced = await db.customerOrder.findFirst({
      where: { userId, depositOrderId: order.id },
      select: { id: true },
    });
    if (referenced) throw new NotFoundException("Activity not found");
    const { status, title } = depositProgress(order);
    const fee = order.feeNgn ?? 0n;
    const row: ActivityRow = {
      id: `dep_${order.id}`,
      kind: "add_money",
      title,
      subtitle: `Transfer of ${formatNaira(order.ngnAmount)}`,
      amountKobo: order.ngnAmount,
      direction: "in",
      status,
      occurredAt: order.createdAt,
      reference: customerReference(order.id),
    };
    return {
      ...this.toItem(row),
      lines: [
        { label: "Amount", value: formatNaira(order.ngnAmount) },
        { label: "Bank transfer fee", value: formatNaira(fee) },
        { label: "Added to your cash", value: formatNaira(order.ngnAmount - fee) },
      ],
      timeline: [
        { label: "Transfer started", done: true, at: order.createdAt.toISOString() },
        {
          label: "Money added",
          done: order.status === "settled",
          at: order.status === "settled" ? order.updatedAt.toISOString() : null,
        },
      ],
      bank: null,
      bank_reference: null,
    };
  }

  private async withdrawalDetail(
    userId: string,
    orderId: string,
    kind: "withdrawal" | "earnings_payout",
  ): Promise<AppActivityDetailDto> {
    const order = await db.rampOrder.findUnique({ where: { id: orderId } });
    if (order?.userId !== userId || order?.kind !== kind) {
      throw new NotFoundException("Activity not found");
    }
    const active = await bankAccountService.getActiveRow(userId);
    const to: AppBankAccountDto = {
      bank_name: order.destBankName ?? active?.bankName ?? "",
      account_ending: (order.destAccountNumber ?? active?.accountNumber ?? "").slice(-4),
      account_name: order.destAccountName ?? active?.resolvedName ?? "",
    };
    const { status, title } = withdrawalProgress(order, to);
    const fee = order.feeNgn ?? 0n;
    const payout = kind === "earnings_payout";
    const row: ActivityRow = {
      id: payout ? `pay_${order.id}` : `wd_${order.id}`,
      kind,
      title: payout ? (order.status === "paid" ? "Earnings paid to your bank" : "Sending earnings to your bank") : title,
      subtitle: `To ${to.bank_name} ••${to.account_ending}`,
      amountKobo: order.ngnAmount,
      direction: "out",
      status,
      occurredAt: order.createdAt,
      reference: customerReference(order.id),
    };
    return {
      ...this.toItem(row),
      lines: [
        { label: "Amount", value: formatNaira(order.ngnAmount) },
        { label: "Fee", value: formatNaira(fee) },
        { label: "You receive", value: formatNaira(order.netNgn ?? order.ngnAmount - fee) },
        { label: "To", value: `${to.bank_name} ••${to.account_ending}` },
      ],
      timeline: [
        { label: "Withdrawal started", done: true, at: order.createdAt.toISOString() },
        {
          label: "Sent to your bank",
          done: order.status === "paid",
          at: order.status === "paid" ? order.updatedAt.toISOString() : null,
        },
      ],
      bank: to,
      bank_reference: order.bankReference,
    };
  }

  private async orderDetail(userId: string, orderId: string): Promise<AppActivityDetailDto> {
    const order = await db.customerOrder.findUnique({ where: { id: orderId } });
    if (order?.userId !== userId) throw new NotFoundException("Activity not found");
    const stock = await db.stock.findUniqueOrThrow({ where: { id: order.stockId } });
    const investment = order.investmentId
      ? await db.investment.findUnique({ where: { id: order.investmentId } })
      : null;
    const deposit = order.depositOrderId
      ? await db.rampOrder.findUnique({ where: { id: order.depositOrderId } })
      : null;
    const view = orderView(order, investment, deposit, stock);
    const buy = order.side === "buy";
    const rate: Rate = { kobo: order.rateKobo, microUsd: order.rateMicroUsd };
    const sharesRaw = orderSharesRaw(order, investment);
    const sharesMicro = sharesRaw === null ? null : sharesMicroOf(sharesRaw, stock.decimals);
    const row: ActivityRow = {
      id: `ord_${order.id}`,
      kind: buy ? "buy" : "sell",
      title: view.title,
      subtitle: view.detail,
      amountKobo: buy ? order.amountKobo : (order.settledKobo ?? order.amountKobo),
      direction: buy ? "out" : "in",
      status: progressOfOrderStatus(view.status),
      occurredAt: order.createdAt,
      reference: customerReference(order.id),
    };
    const preview = await db.customerOrderPreview.findUnique({ where: { id: order.previewId } });
    // The price per share actually paid (or received) once the order filled;
    // until then the price the customer previewed. Never the protective limit.
    const filled =
      investment && (investment.status === "filled" || investment.status === "partial")
        ? effectiveSharePriceMicroUsd(
            stock,
            order.side,
            fromDbRaw(investment.amountIn),
            fromDbRawNullable(investment.amountOut) ?? 0n,
          )
        : null;
    const perShare = filled ?? preview?.referencePriceMicroUsd ?? null;
    const priceText = perShare === null ? "—" : formatNaira(toKobo(perShare, rate));
    const lines: { label: string; value: string }[] = [];
    if (buy) {
      lines.push(
        { label: "Amount", value: formatNaira(order.amountKobo) },
        { label: "Shares", value: sharesMicro === null ? "0 shares" : formatShares(sharesMicro) },
        { label: "Price per share", value: priceText },
      );
    } else {
      lines.push(
        { label: "Shares sold", value: sharesMicro === null ? "0 shares" : formatShares(sharesMicro) },
        { label: "Price per share", value: priceText },
        { label: "You received", value: formatNaira(order.settledKobo ?? order.amountKobo) },
      );
    }
    const terms = preview?.terms as { fees?: { label: string; kobo: string | null; note: string | null }[] } | null;
    for (const fee of terms?.fees ?? []) {
      lines.push({
        label: fee.label,
        value: fee.kobo !== null ? formatNaira(BigInt(fee.kobo)) : (fee.note ?? ""),
      });
    }
    return {
      ...this.toItem(row),
      lines,
      timeline: view.timeline,
      bank: null,
      bank_reference: null,
    };
  }

  private async reinvestDetail(userId: string, investmentId: string, rate: Rate | null): Promise<AppActivityDetailDto> {
    const inv = await db.investment.findUnique({ where: { id: investmentId } });
    if (inv?.userId !== userId || inv?.purpose !== "reinvest") {
      throw new NotFoundException("Activity not found");
    }
    const stock = await db.stock.findUnique({ where: { id: inv.stockId } });
    const name = stock ? appCatalogService.stockRef(stock).name : "your chosen stock";
    const kobo = koboOf(fromDbRaw(inv.amountIn), rate);
    let status: AppProgress = "processing";
    if (inv.status === "filled" || inv.status === "partial") status = "completed";
    else if (inv.status === "failed" || inv.status === "cancelled") status = "failed";
    const row: ActivityRow = {
      id: `inv_${inv.id}`,
      kind: "reinvest",
      title: `Reinvested in ${name}`,
      subtitle: kobo === null ? "From your earnings" : `${formatNaira(kobo)} from your earnings`,
      amountKobo: kobo,
      direction: "none",
      status,
      occurredAt: inv.createdAt,
      reference: customerReference(inv.id),
    };
    return {
      ...this.toItem(row),
      lines: [
        { label: "Amount", value: kobo === null ? "—" : formatNaira(kobo) },
        { label: "Stock", value: name },
      ],
      timeline: [
        { label: "Reinvest placed", done: true, at: inv.createdAt.toISOString() },
        {
          label: "Bought",
          done: status === "completed",
          at: status === "completed" ? inv.updatedAt.toISOString() : null,
        },
      ],
      bank: null,
      bank_reference: null,
    };
  }

  private async earnOpDetail(userId: string, opId: string, rate: Rate | null): Promise<AppActivityDetailDto> {
    const op = await db.onchainOperation.findUnique({ where: { id: opId } });
    const action = op ? opAction(op) : null;
    if (op?.userId !== userId || op?.kind !== "strategy" || (action !== "enter" && action !== "exit")) {
      throw new NotFoundException("Activity not found");
    }
    const position = await db.strategyPosition.findUnique({ where: { operationId: op.id } });
    const strategy = await db.strategy.findUnique({ where: { id: position?.strategyId ?? "" } });
    const prov = strategy?.provenance as { stockId?: string } | null;
    const stock = prov?.stockId ? await db.stock.findUnique({ where: { id: prov.stockId } }) : null;
    const name = stock ? appCatalogService.stockRef(stock).name : "your pool";
    const enter = action === "enter";
    const micro = position
      ? enter
        ? fromDbRaw(position.principalUsdc)
        : fromDbRaw(position.valueUsdc ?? position.principalUsdc)
      : 0n;
    const kobo = koboOf(micro, rate);
    const row: ActivityRow = {
      id: `eop_${op.id}`,
      kind: enter ? "earn_join" : "earn_withdraw",
      title: enter ? `Joined Earn on ${name}` : `Withdrew from Earn on ${name}`,
      subtitle: kobo === null ? "" : `${formatNaira(kobo)}`,
      amountKobo: kobo,
      direction: enter ? "out" : "in",
      status: opStatus(op),
      occurredAt: op.createdAt,
      reference: customerReference(op.id),
    };
    const expected = unpack(op.expected) as {
      quote?: { request?: { inputs?: { asset: string; raw: bigint }[] } };
    };
    let sharesText = "0 shares";
    let cashText = formatNaira(0n);
    if (enter && stock) {
      const inputs = expected?.quote?.request?.inputs ?? [];
      const stockLeg = inputs.find((i) => i.asset === stock.assetKey);
      const cashLeg = inputs.find((i) => i.asset !== stock.assetKey);
      if (stockLeg) sharesText = formatShares(sharesMicroOf(stockLeg.raw, stock.decimals));
      if (cashLeg) cashText = formatNaira(koboOf(cashLeg.raw, rate) ?? 0n);
    }
    return {
      ...this.toItem(row),
      lines: enter
        ? [
            { label: "Added", value: kobo === null ? "—" : formatNaira(kobo) },
            { label: "Shares", value: sharesText },
            { label: "Cash", value: cashText },
          ]
        : [{ label: "Received", value: kobo === null ? "—" : formatNaira(kobo) }],
      timeline: [
        {
          label: enter ? "Joined the pool" : "Withdrawal started",
          done: true,
          at: op.createdAt.toISOString(),
        },
        {
          label: enter ? "Position active" : "Withdrawal complete",
          done: op.status === "finalized",
          at: op.status === "finalized" ? op.updatedAt.toISOString() : null,
        },
      ],
      bank: null,
      bank_reference: null,
    };
  }

  private async weekDetail(userId: string, week: string, rate: Rate | null): Promise<AppActivityDetailDto> {
    const earnings = await db.earning.findMany({ where: { userId, week } });
    if (earnings.length === 0) throw new NotFoundException("Activity not found");
    const total = earnings.reduce((sum, row) => sum + BigInt(row.amountUsdc), 0n);
    if (total <= 0n) throw new NotFoundException("Activity not found");
    const kobo = koboOf(total, rate);
    let detail = "Earnings collected";
    try {
      const weeks = await earningsService.list(userId, { page: 1, size: 100 });
      const found = weeks.data.find((w) => w.week === week);
      if (found) {
        if (found.status === "paid") detail = "Paid to your bank";
        else if (found.status === "reinvested") detail = "Reinvested in your chosen stock";
        else if (found.status === "mixed") detail = "Partly paid, partly reinvested";
        else if (week === lagosWeek(now())) detail = "Pays out on Friday";
        else detail = "Below ₦2,000, so it rolls over";
      }
    } catch {
      detail = "Earnings collected";
    }
    const closedAt = weekCloseLagos(week);
    const row: ActivityRow = {
      id: `wk_${week}`,
      kind: "earnings",
      title: "Weekly earnings",
      subtitle: detail,
      amountKobo: kobo,
      direction: "in",
      status: "completed",
      occurredAt: closedAt,
      reference: customerReference(`wk_${week}`),
    };
    return {
      ...this.toItem(row),
      lines: [
        { label: "Earned", value: kobo === null ? "—" : formatNaira(kobo) },
        { label: "What happened", value: detail },
      ],
      timeline: [
        { label: "Week ended", done: true, at: closedAt.toISOString() },
        { label: detail, done: detail === "Paid to your bank" || detail.startsWith("Reinvested"), at: null },
      ],
      bank: null,
      bank_reference: null,
    };
  }
}

export const appActivityService = new AppActivityService();
