import { randomUUID } from "node:crypto";

import { expect, test as base, type Page } from "@playwright/test";

export const ORIGIN = "http://127.0.0.1:3108";

export const PIN = "1357";

// A unique sign-in email per test.
export function email(tag: string, domain = "v3st.test"): string {
  return `e2e-${tag}-${Math.random().toString(36).slice(2, 10)}@${domain}`;
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

// One customer API call made by the page itself, so the browser's own cookie
// rules apply: the production session cookie is Secure, which the browser
// sends to 127.0.0.1 but Playwright's request client does not. The page must
// be on the app's origin. It fails the test unless the API answers 2xx, so a
// broken setup step never passes silently.
export async function api<T = unknown>(
  page: Page,
  verb: Verb,
  path: string,
  options: { data?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const result = await page.evaluate(
    async ({ verb, url, data, idempotencyKey }) => {
      const headers: Record<string, string> = { accept: "application/json" };
      const init: RequestInit = { method: verb, headers, credentials: "same-origin" };
      if (data !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(data);
      }
      if (idempotencyKey !== undefined) headers["idempotency-key"] = idempotencyKey;
      const res = await fetch(url, init);
      const body = (await res.json().catch(() => null)) as { data?: unknown; message?: string } | null;
      return { ok: res.ok, status: res.status, body };
    },
    { verb, url: `/api/v1/app${path}`, data: options.data, idempotencyKey: options.idempotencyKey },
  );
  expect(result.ok, `${verb} ${path} → ${result.status} ${result.body?.message ?? ""}`).toBe(true);
  return result.body?.data as T;
}

// An anonymous beta customer, signed in through the simulated issuer and left
// on /setup, the app origin the `api` helper calls from.
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

// Adds test money and waits until the worker has settled it into cash (the
// bank-transfer fee comes off, so available cash ends below the amount sent).
export async function fundCash(page: Page, amountKobo: string): Promise<void> {
  const deposit = await api<{ id: string }>(page, "POST", "/cash/deposits", {
    data: { amount_kobo: amountKobo },
    idempotencyKey: randomUUID(),
  });
  await api(page, "POST", `/beta/deposits/${deposit.id}/complete`);
  await expect
    .poll(
      async () => (await api<{ status: string }>(page, "GET", `/cash/deposits/${deposit.id}`)).status,
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe("completed");
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
