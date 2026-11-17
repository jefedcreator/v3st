import { randomUUID } from "node:crypto";

import type { InvestmentAuthorization } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { STOCK_PROFILES } from "@/backend/content/stock-profiles";
import { authorizationService } from "@/backend/services/authorizations";
import { securityService } from "@/backend/services/security";
import { fromDbRaw } from "@/utils/asset-units";
import { NotFoundException } from "@/utils/exceptions";
import type { AppAutomationDto } from "@/types/app";

export type { AppAutomationDto } from "@/types/app";

const DAY_MS = 86_400_000;
const RENEWAL_WINDOW_MS = policy.app.earn.automation.renewReminderDays * DAY_MS;
const RENEW_TTL_MS = policy.app.earn.automation.expiryDays * DAY_MS;

function isOrderConsent(row: InvestmentAuthorization): boolean {
  return (
    row.actions.length > 0 &&
    row.actions.every((action) => action === "order_buy" || action === "order_sell")
  );
}

async function stockNameOf(stockId: string | null): Promise<string> {
  if (!stockId) return "your stock";
  const stock = await db.stock.findUnique({ where: { id: stockId } });
  if (!stock) return "your stock";
  const profile = stock.displayTicker ? STOCK_PROFILES[stock.displayTicker] : undefined;
  return profile?.name ?? stock.name;
}

async function automationDto(row: InvestmentAuthorization): Promise<AppAutomationDto> {
  const at = now();
  const active = row.revokedAt === null && row.expiresAt > at;
  const actions = row.actions;
  let title = "Automatic action";
  let detail = "";
  const stockName = await stockNameOf(row.stockIds[0] ?? null);
  if (actions.includes("claim") && actions.includes("reward_conversion")) {
    title = `Collect your ${stockName} Earn fees`;
    detail = "Every Thursday night. Fees are added to your earnings.";
  } else if (actions.includes("reinvest")) {
    title = `Reinvest your earnings in ${stockName}`;
    detail = "Every Friday.";
  }
  return {
    id: row.id,
    title,
    detail,
    active,
    expires_at: row.expiresAt.toISOString(),
    needs_renewal: active && row.expiresAt.getTime() - at.getTime() <= RENEWAL_WINDOW_MS,
  };
}

class AppAutomationsService {
  async list(userId: string): Promise<AppAutomationDto[]> {
    const rows = await db.investmentAuthorization.findMany({
      where: { userId, kind: "standing" },
      orderBy: { createdAt: "desc" },
    });
    const out: AppAutomationDto[] = [];
    for (const row of rows) {
      if (isOrderConsent(row)) continue;
      out.push(await automationDto(row));
    }
    return out;
  }

  private async ownedRow(userId: string, id: string): Promise<InvestmentAuthorization> {
    const row = await db.investmentAuthorization.findUnique({ where: { id } });
    if (row?.userId !== userId || row.kind !== "standing" || isOrderConsent(row)) {
      throw new NotFoundException("Automation not found");
    }
    return row;
  }

  async revoke(userId: string, id: string): Promise<AppAutomationDto> {
    const row = await this.ownedRow(userId, id);
    await authorizationService.revoke(userId, row.id);
    const fresh = await db.investmentAuthorization.findUniqueOrThrow({ where: { id: row.id } });
    return automationDto(fresh);
  }

  async renew(userId: string, id: string, pin: string): Promise<AppAutomationDto> {
    await securityService.verifyPin(userId, pin);
    const row = await this.ownedRow(userId, id);
    const created = await authorizationService.create(
      userId,
      {
        kind: "standing",
        stock_ids: row.stockIds,
        strategy_ids: row.strategyIds,
        actions: row.actions as ("claim" | "reward_conversion" | "reinvest" | "withdrawal_sale")[],
        max_action_ngn: fromDbRaw(row.maxActionNgn ?? "0"),
        max_total_ngn: fromDbRaw(row.maxTotalNgn ?? "0"),
        max_fee_bps: row.maxFeeBps ?? policy.app.orders.consent.maxFeeBps,
        max_slippage_bps: row.maxSlippageBps ?? policy.app.orders.consent.maxSlippageBps,
        expires_at: new Date(now().getTime() + RENEW_TTL_MS).toISOString(),
        policy_version: policy.app.policyVersion,
        disclosure_version: row.disclosureVersion ?? CUSTOMER_DOCUMENTS.risks.version,
      },
      `renew:${userId}:${row.id}:${randomUUID()}`,
    );
    await authorizationService.revoke(userId, row.id);
    const fresh = await db.investmentAuthorization.findUniqueOrThrow({
      where: { id: created.dto.id },
    });
    return automationDto(fresh);
  }
}

export const appAutomationsService = new AppAutomationsService();
