import { randomUUID } from "node:crypto";

import { expect, test as base, type APIResponse, type Page } from "@playwright/test";

export const ORIGIN = "http://127.0.0.1:3108";

export const PIN = "1357";

// A unique beta email per test.
export function email(tag: string): string {
  return `e2e-${tag}-${Math.random().toString(36).slice(2, 10)}@v3st.test`;
}

/**
 * App e2e fixtures. The context guard fails a test on any request to a
 * non-127.0.0.1:3108 origin.
 */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ context }, use) => {
      const violations: string[] = [];
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) {
          violations.push(route.request().method() + " " + url.toString());
          return route.abort();
        }
        return route.continue();
      });
      await use();
      expect(violations, `off-origin requests: ${violations.join(", ")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

type Verb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// One customer API call through the page's cookie jar. It fails the test
// unless the API answers 2xx, so a broken setup step never passes silently.
export async function api<T = unknown>(
  page: Page,
  verb: Verb,
  path: string,
  options: { data?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Origin: ORIGIN, accept: "application/json" };
  const init: { method: Verb; headers: Record<string, string>; data?: string } = {
    method: verb,
    headers,
  };
  if (options.data !== undefined) {
    headers["content-type"] = "application/json";
    init.data = JSON.stringify(options.data);
  }
  if (options.idempotencyKey !== undefined) {
    headers["idempotency-key"] = options.idempotencyKey;
  }
  const res: APIResponse = await page.request.fetch(`${ORIGIN}/api/v1/app${path}`, init);
  const body = (await res.json().catch(() => null)) as { data?: T; message?: string } | null;
  expect(res.ok(), `${verb} ${path} → ${res.status()} ${body?.message ?? ""}`).toBe(true);
  return body?.data as T;
}

// An anonymous beta customer, signed in through the simulated issuer and left
// on /setup. `page.request` shares the browser context's cookie jar, so the
// API session lands in the browser too.
export async function signedIn(page: Page, address: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(address);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/setup");
}

// A fully set-up customer: identity, PIN, the onboarding documents and the
// sim bank account (the values `readyCustomer` uses), through the app's API.
export async function readyAccount(page: Page, address: string): Promise<void> {
  await signedIn(page, address);
  const documents = await api<{ slug: string; version: string }[]>(page, "GET", "/documents");
  await api(page, "POST", "/identity", { data: { test_identity_id: "ada_tier2" } });
  await api(page, "PUT", "/security/pin", { data: { pin: PIN } });
  await api(page, "POST", "/agreements", {
    data: {
      documents: ["terms", "risks", "how-shares-are-held"].map((slug) => ({
        slug,
        version: documents.find((doc) => doc.slug === slug)!.version,
      })),
    },
  });
  await api(page, "PUT", "/bank-account", {
    data: { bank_code: "sim-bank-a", account_number: "0123456789", pin: PIN },
  });
  await page.goto("/home");
}

// Adds test money and waits until it is available cash (the worker settles it).
export async function fundCash(page: Page, amountKobo: string): Promise<void> {
  const deposit = await api<{ id: string }>(page, "POST", "/cash/deposits", {
    data: { amount_kobo: amountKobo },
    idempotencyKey: randomUUID(),
  });
  await api(page, "POST", `/beta/deposits/${deposit.id}/complete`);
  await expect
    .poll(
      async () => {
        const cash = await api<{ available_kobo: string | null }>(page, "GET", "/cash");
        return BigInt(cash.available_kobo ?? "0") >= BigInt(amountKobo);
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true);
}

// Joins the first Earn product through the API, which creates its standing
// automatic action.
export async function joinFirstEarn(page: Page, amountKobo: string): Promise<string> {
  const products = await api<{ id: string }[]>(page, "GET", "/earn");
  const product = products[0]!;
  const preview = await api<{ preview_id: string; risk_document: { version: string } }>(
    page,
    "POST",
    `/earn/${product.id}/preview`,
    { data: { amount_kobo: amountKobo } },
  );
  await api(page, "POST", `/earn/${product.id}/join`, {
    data: {
      preview_id: preview.preview_id,
      pin: PIN,
      accepted_risk_version: preview.risk_document.version,
    },
    idempotencyKey: randomUUID(),
  });
  return product.id;
}
