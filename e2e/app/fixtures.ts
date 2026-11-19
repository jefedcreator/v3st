import { expect, test as base, type Page } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:3108";

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

async function call(page: Page, verb: "GET" | "POST" | "PUT", path: string, data?: unknown) {
  return page.request.fetch(`${ORIGIN}/api/v1/app${path}`, {
    method: verb,
    headers: { "content-type": "application/json", Origin: ORIGIN },
    ...(data === undefined ? {} : { data: JSON.stringify(data) }),
  });
}

async function jsonEnveloped(res: { json: () => Promise<unknown> }): Promise<unknown> {
  const body = await res.json();
  const envelope = body as { data?: unknown };
  return envelope.data;
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

// A fully-set-up customer: identity, PIN, the onboarding documents and the
// sim bank account, all through the app's own API.
export async function readyAccount(page: Page, address: string): Promise<void> {
  await signedIn(page, address);
  const documentsRes = await call(page, "GET", "/documents");
  const documents = (await jsonEnveloped(documentsRes)) as {
    slug: string;
    version: string;
    accepted: boolean;
  }[];
  await call(page, "POST", "/identity", { test_identity_id: "ada_tier2" });
  await call(page, "PUT", "/security/pin", { pin: PIN });
  await call(page, "POST", "/agreements", {
    documents: ["terms", "risks", "how-shares-are-held"].map((slug) => ({
      slug,
      version: documents.find((doc) => doc.slug === slug)!.version,
    })),
  });
  await call(page, "PUT", "/bank-account", {
    bank_code: "sim-bank-a",
    account_number: "0123456789",
    pin: PIN,
  });
  await page.goto("/home");
}
