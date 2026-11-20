import { cache } from "react";
import { unstable_rethrow } from "next/navigation";

import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { reportError } from "@/backend/observability";
import { agreementService } from "@/backend/services/agreements";
import { appActivityService } from "@/backend/services/app/activity";
import { appAutomationsService } from "@/backend/services/app/automations";
import { appCatalogService } from "@/backend/services/app/catalog";
import type { ChartRange } from "@/backend/services/stocks/history";
import { appCashService } from "@/backend/services/app/cash";
import { appEarnService } from "@/backend/services/app/earn";
import { appEarningsService } from "@/backend/services/app/earnings";
import { appHomeService } from "@/backend/services/app/home";
import { appIdentityService } from "@/backend/services/app/identity";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { appOrdersService } from "@/backend/services/app/orders";
import { appProfileService } from "@/backend/services/app/profile";
import { appSessionService } from "@/backend/services/app/session";
import { NotFoundException } from "@/utils/exceptions";
import type {
  AppActivityDetailDto,
  AppActivityPageDto,
  AppBankDto,
  AppDepositDto,
  AppDocumentSummaryDto,
  AppEarningsDto,
  AppEarnProductDto,
  AppChartDto,
  AppOnboardingDto,
  AppOrderDto,
  AppSessionDto,
  AppStockDetailDto,
  AppStockListItemDto,
  AppTestIdentityDto,
  AppAutomationDto,
  AppProfileDto,
} from "@/types/app";
import type { AuthenticatedUser } from "@/backend/middleware/types";

// One cached server read per API read. Contracts:
// - null: the read failed (the page shows its error body);
// - undefined: a detail read that found nothing (the page calls notFound());
// - the DTO otherwise.
// Each read takes the user first so the cache key covers the reader.

type Detail<T> = T | null | undefined;

async function catching<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    return reportNull(name, error);
  }
}

async function catchingDetail<T>(
  name: string,
  read: () => Promise<T>,
): Promise<Detail<T>> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof NotFoundException) return undefined;
    return reportNull(name, error);
  }
}

function reportNull(name: string, error: unknown): null {
  reportError(error, { read: name });
  return null;
}

export const readSession = cache(
  async (user: AuthenticatedUser): Promise<AppSessionDto | null> =>
    catching("session", async () => appSessionService.get(user)),
);

export const readOnboarding = cache(
  async (user: AuthenticatedUser): Promise<AppOnboardingDto | null> =>
    catching("onboarding", async () => appOnboardingService.status(user.id)),
);

export const readTestIdentities = cache(
  async (_user: AuthenticatedUser): Promise<AppTestIdentityDto[] | null> =>
    catching<AppTestIdentityDto[]>("test-identities", async () => appIdentityService.testIdentities()),
);

export const readDocuments = cache(
  async (user: AuthenticatedUser): Promise<AppDocumentSummaryDto[] | null> =>
    catching("documents", async () => {
      const accepted = await agreementService.acceptedCurrent(user.id);
      return Object.values(CUSTOMER_DOCUMENTS).map((doc) => ({
        slug: doc.slug,
        title: doc.title,
        version: doc.version,
        accepted: accepted.has(doc.slug),
      }));
    }),
);

export const readBanks = cache(
  async (_user: AuthenticatedUser): Promise<AppBankDto[] | null> =>
    catching<AppBankDto[]>("banks", async () => appCashService.banks()),
);

export const readHome = cache(
  async (
    user: AuthenticatedUser,
  ): Promise<{ home: Awaited<ReturnType<typeof appHomeService.get>>; activity: AppActivityPageDto } | null> =>
    catching("home", async () => {
      const home = await appHomeService.get(user.id);
      const activity = await appActivityService.list(user.id, { limit: 10 });
      return { home, activity };
    }),
);

export const readStocks = cache(
  async (user: AuthenticatedUser, q: { query?: string; watchlist?: boolean }) =>
    catching<AppStockListItemDto[]>("stocks", async () => appCatalogService.list(user.id, q)),
);

export const readStock = cache(async (user: AuthenticatedUser, id: string) =>
  catchingDetail<AppStockDetailDto>("stock", async () => appCatalogService.get(user.id, id)),
);

export const readOrder = cache(async (user: AuthenticatedUser, id: string) =>
  catchingDetail<AppOrderDto>("order", async () => appOrdersService.get(user.id, id)),
);

export const readChart = cache(async (_user: AuthenticatedUser, id: string, range: ChartRange) =>
  catching<AppChartDto>("chart", async () => appCatalogService.chart(id, range)),
);

export const readCash = cache(
  async (
    user: AuthenticatedUser,
  ): Promise<{ cash: Awaited<ReturnType<typeof appCashService.balance>>; bankAccount: Awaited<ReturnType<typeof appCashService.bankAccount>> } | null> =>
    catching("cash", async () => {
      const cash = await appCashService.balance(user.id);
      const bankAccount = await appCashService.bankAccount(user.id);
      return { cash, bankAccount };
    }),
);

export const readEarnProducts = cache(
  async (user: AuthenticatedUser): Promise<AppEarnProductDto[] | null> =>
    catching<AppEarnProductDto[]>("earn-products", async () => appEarnService.products(user.id)),
);

export const readEarnProduct = cache(async (user: AuthenticatedUser, id: string) =>
  catchingDetail<AppEarnProductDto>("earn-product", async () => appEarnService.product(user.id, id)),
);

export const readEarnings = cache(
  async (user: AuthenticatedUser): Promise<AppEarningsDto | null> =>
    catching("earnings", async () => appEarningsService.summary(user.id)),
);

export const readActivity = cache(async (user: AuthenticatedUser, cursor?: string) =>
  catching<AppActivityPageDto>("activity", async () =>
    appActivityService.list(user.id, { cursor }),
  ),
);

export const readActivityItem = cache(
  async (
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ item: AppActivityDetailDto; deposit: AppDepositDto | null } | null | undefined> =>
    catchingDetail("activity-item", async () => {
      const item = await appActivityService.get(user.id, id);
      let deposit: AppDepositDto | null = null;
      if (id.startsWith("dep_") && item.status === "waiting") {
        deposit = await appCashService.getDeposit(user.id, id.slice("dep_".length));
      }
      return { item, deposit };
    }),
);

export const readSettings = cache(
  async (
    user: AuthenticatedUser,
  ): Promise<{ profile: AppProfileDto; automations: AppAutomationDto[]; documents: AppDocumentSummaryDto[] } | null> =>
    catching("settings", async () => {
      const profile = await appProfileService.get(user.id);
      const automations = await appAutomationsService.list(user.id);
      const accepted = await agreementService.acceptedCurrent(user.id);
      const documents = Object.values(CUSTOMER_DOCUMENTS).map((doc) => ({
        slug: doc.slug,
        title: doc.title,
        version: doc.version,
        accepted: accepted.has(doc.slug),
      }));
      return { profile, automations, documents };
    }),
);
