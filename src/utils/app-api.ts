import type {
  AppActivityDetailDto,
  AppActivityPageDto,
  AppAutomationDto,
  AppBankAccountDto,
  AppBankDto,
  AppCashDto,
  AppChartDto,
  AppDepositDto,
  AppDocumentDto,
  AppDocumentSlug,
  AppDocumentSummaryDto,
  AppDeviceSessionDto,
  AppEarnPreviewDto,
  AppEarningsDto,
  AppEarnProductDto,
  AppHomeDto,
  AppNotificationDto,
  AppOnboardingDto,
  AppOrderDto,
  AppOrderPreviewDto,
  AppProfileDto,
  AppSessionDto,
  AppStockDetailDto,
  AppStockListItemDto,
  AppWithdrawalDto,
  AppWithdrawalPreviewDto,
} from "@/types/app";

export type OrderPreviewBody = {
  stock_id: string;
  side: "buy" | "sell";
  amount_kobo?: string;
  sell_all?: true;
  pay_with?: "cash" | "bank_transfer";
};

type Envelope<T> = { status: number; message?: string; code?: string; data: T };

export class AppApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AppApiError";
    this.status = status;
    this.code = code;
  }
}

export type AppApiDeps = {
  fetch: typeof fetch;
  onSignInRequired: () => void;
};

export type AppApi = ReturnType<typeof createAppApi>;

type Query = Record<string, string | boolean | undefined>;

function baseUrl(path: string, query?: Query): string {
  if (query === undefined) return `/api/v1/app${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, value === true ? "true" : String(value));
  }
  const text = params.toString();
  if (text === "") return `/api/v1/app${path}`;
  return `/api/v1/app${path}?${text}`;
}

export function createAppApi(deps: AppApiDeps) {
  async function request<T>(
    method: string,
    path: string,
    query?: Query,
    body?: unknown,
    key?: string,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    };
    if (body !== undefined) {
      init.headers = { accept: "application/json", "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    if (key !== undefined) {
      init.headers = { ...init.headers, "idempotency-key": key };
    }
    let response: Response;
    try {
      response = await deps.fetch(baseUrl(path, query), init);
    } catch {
      throw new AppApiError(
        "You're offline or the connection dropped. Check it and try again.",
        0,
        "NETWORK",
      );
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    const envelope = json as Envelope<T> | null;
    const code =
      typeof envelope?.code === "string" ? envelope.code : response.ok ? "OK" : codeFor(response.status);
    const message =
      typeof envelope?.message === "string" && envelope.message !== ""
        ? envelope.message
        : response.ok
          ? ""
          : "Something went wrong. Please try again.";
    if (!response.ok) {
      if (code === "SIGN_IN_REQUIRED" || code === "SIGN_IN_AGAIN" || response.status === 401) {
        deps.onSignInRequired();
      }
      throw new AppApiError(message, response.status, code);
    }
    return (envelope?.data ?? (json as T)) as T;
  }

  return {
    auth: {
      privy: (body: { access_token: string; identity_token: string }) =>
        request<{ is_new_customer: boolean; next_step: AppOnboardingDto["next_step"] }>(
          "POST",
          "/auth/privy",
          undefined,
          body,
        ),
      logout: () => request<unknown>("POST", "/auth/logout"),
    },
    beta: {
      privyTokens: (email: string) =>
        request<{ access_token: string; identity_token: string }>(
          "POST",
          "/beta/privy-tokens",
          undefined,
          { email },
        ),
      completeDeposit: (id: string) =>
        request<AppDepositDto>("POST", `/beta/deposits/${id}/complete`),
      completeOrderTransfer: (id: string) =>
        request<AppOrderDto>("POST", `/beta/orders/${id}/complete-transfer`),
    },
    session: {
      get: () => request<AppSessionDto>("GET", "/session"),
    },
    onboarding: {
      get: () => request<AppOnboardingDto>("GET", "/onboarding"),
    },
    identity: {
      testIdentities: () =>
        request<import("@/types/app").AppTestIdentityDto[]>("GET", "/identity/test-identities"),
      verify: (testIdentityId: string) =>
        request<{ verified: boolean; onboarding: AppOnboardingDto }>(
          "POST",
          "/identity",
          undefined,
          { test_identity_id: testIdentityId },
        ),
    },
    documents: {
      list: () => request<AppDocumentSummaryDto[]>("GET", "/documents"),
      get: (slug: AppDocumentSlug) => request<AppDocumentDto>("GET", `/documents/${slug}`),
    },
    agreements: {
      accept: (documents: { slug: AppDocumentSlug; version: string }[]) =>
        request<AppOnboardingDto>("POST", "/agreements", undefined, { documents }),
    },
    security: {
      setPin: (body: { pin: string; current_pin?: string }) =>
        request("PUT", "/security/pin", undefined, body) as Promise<{
          [k: string]: unknown;
        }>,
      resetPin: (body: { access_token: string; identity_token: string; pin: string }) =>
        request("POST", "/security/pin/reset", undefined, body) as Promise<unknown>,
      sessions: () => request<AppDeviceSessionDto[]>("GET", "/security/sessions"),
      revokeSession: (id: string) => request("DELETE", `/security/sessions/${id}`),
      signOutOthers: () => request("POST", "/security/sessions/sign-out-others"),
    },
    cash: {
      get: () => request<AppCashDto>("GET", "/cash"),
      createDeposit: (amountKobo: string, key: string) =>
        request<AppDepositDto>("POST", "/cash/deposits", undefined, { amount_kobo: amountKobo }, key),
      deposit: (id: string) => request<AppDepositDto>("GET", `/cash/deposits/${id}`),
    },
    banks: {
      list: () => request<AppBankDto[]>("GET", "/banks"),
    },
    bankAccount: {
      get: () => request<AppBankAccountDto | null>("GET", "/bank-account"),
      put: (body: { bank_code: string; account_number: string; pin: string }) =>
        request<AppBankAccountDto>("PUT", "/bank-account", undefined, body),
    },
    withdrawals: {
      preview: (amountKobo: string) =>
        request<AppWithdrawalPreviewDto>("POST", "/withdrawals/preview", undefined, {
          amount_kobo: amountKobo,
        }),
      create: (body: { preview_id: string; pin: string }, key: string) =>
        request<AppWithdrawalDto>("POST", "/withdrawals", undefined, body, key),
    },
    stocks: {
      list: (q: { q?: string; watchlist?: boolean }) =>
        request<AppStockListItemDto[]>("GET", "/stocks", q as Query),
      get: (id: string) => request<AppStockDetailDto>("GET", `/stocks/${id}`),
      chart: (id: string, range: string) =>
        request<AppChartDto>("GET", `/stocks/${id}/chart`, { range }),
    },
    watchlist: {
      add: (id: string) => request<{ on_watchlist: boolean }>("PUT", `/watchlist/${id}`),
      remove: (id: string) => request<{ on_watchlist: boolean }>("DELETE", `/watchlist/${id}`),
    },
    home: {
      get: () => request<AppHomeDto>("GET", "/home"),
    },
    orders: {
      preview: (body: OrderPreviewBody) =>
        request<AppOrderPreviewDto>("POST", "/orders/preview", undefined, body),
      place: (body: { preview_id: string; pin: string }, key: string) =>
        request<AppOrderDto>("POST", "/orders", undefined, body, key),
      get: (id: string) => request<AppOrderDto>("GET", `/orders/${id}`),
      cancel: (id: string) => request<AppOrderDto>("DELETE", `/orders/${id}`),
    },
    earn: {
      list: () => request<AppEarnProductDto[]>("GET", "/earn"),
      get: (id: string) => request<AppEarnProductDto>("GET", `/earn/${id}`),
      preview: (id: string, amountKobo: string) =>
        request<AppEarnPreviewDto>("POST", `/earn/${id}/preview`, undefined, {
          amount_kobo: amountKobo,
        }),
      join: (
        id: string,
        body: { preview_id: string; pin: string; accepted_risk_version: string },
        key: string,
      ) => request<AppEarnProductDto>("POST", `/earn/${id}/join`, undefined, body, key),
      withdrawPreview: (positionId: string) =>
        request<import("@/types/app").AppEarnWithdrawPreviewDto>(
          "POST",
          `/earn/positions/${positionId}/withdraw/preview`,
        ),
      withdraw: (positionId: string, body: { preview_id: string; pin: string }, key: string) =>
        request<import("@/types/app").AppEarnPositionDto>(
          "POST",
          `/earn/positions/${positionId}/withdraw`,
          undefined,
          body,
          key,
        ),
    },
    earnings: {
      get: () => request<AppEarningsDto>("GET", "/earnings"),
      setPreference: (body: {
        choice: "payout" | "reinvest" | "unset";
        stock_id?: string;
        pin: string;
      }) => request("PUT", "/earnings/preference", undefined, body) as Promise<unknown>,
    },
    activity: {
      list: (q: { cursor?: string; limit?: number }) =>
        request<AppActivityPageDto>("GET", "/activity", q as Query),
      get: (id: string) => request<AppActivityDetailDto>("GET", `/activity/${id}`),
    },
    notifications: {
      list: (cursor?: string) =>
        request<{ items: AppNotificationDto[]; next_cursor: string | null }>(
          "GET",
          "/notifications",
          cursor === undefined ? undefined : { cursor },
        ),
      markRead: (body: { ids: string[] } | { all: true }) =>
        request<{ unread: number }>("POST", "/notifications/read", undefined, body),
    },
    automations: {
      list: () => request<AppAutomationDto[]>("GET", "/automations"),
      turnOff: (id: string) => request<AppAutomationDto>("DELETE", `/automations/${id}`),
      renew: (id: string, pin: string) =>
        request<AppAutomationDto>("POST", `/automations/${id}/renew`, undefined, { pin }),
    },
    profile: {
      get: () => request<AppProfileDto>("GET", "/profile"),
      update: (body: { preferred_name: string | null }) =>
        request<AppProfileDto>("PATCH", "/profile", undefined, body),
    },
  };
}

function codeFor(status: number): string {
  return status === 401 ? "SIGN_IN_REQUIRED" : "SOMETHING_WENT_WRONG";
}

function defaultOnSignInRequired() {
  if (typeof window === "undefined") return;
  window.location.assign("/signin?next=" + encodeURIComponent(location.pathname + location.search));
}

export const appApi = createAppApi({
  fetch: (...args) => fetch(...args),
  onSignInRequired: defaultOnSignInRequired,
});
