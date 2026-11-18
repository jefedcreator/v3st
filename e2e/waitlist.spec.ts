import { WAITLIST_SUCCESS_COPY } from "../src/components/landing/waitlist-status";

import { expect, test } from "./test";

const SUCCESS_BODY = JSON.stringify({
  status: 200,
  message: "You're on the list.",
  data: { joined: true },
});

test("joins inline with JavaScript", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/v1/waitlist", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: SUCCESS_BODY }),
  );
  await page.goto("/");
  await page.locator("#hero-email").fill("tester@example.com");
  await page.locator('form:has(#hero-email) button[type="submit"]').click();
  const live = page.locator("#hero-email-status");
  await expect(live).toHaveText(WAITLIST_SUCCESS_COPY);
  await expect(live).toHaveClass(/waitlist-success/);
  await expect(page.locator("#hero-email")).toHaveCount(0);
});

test("shows the API message for an invalid email", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/v1/waitlist", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        status: 422,
        message: "Enter a valid email address.",
        code: "CHECK_DETAILS",
        data: null,
      }),
    }),
  );
  await page.goto("/");
  await page.locator("#hero-email").fill("not-an-email");
  await page.locator('form:has(#hero-email) button[type="submit"]').click();
  const live = page.locator("#hero-email-status");
  await expect(live).toHaveText("Enter a valid email address.");
  await expect(page.locator("#hero-email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#hero-email")).toHaveAttribute(
    "aria-describedby",
    "hero-email-status",
  );
});

test("shows rate-limit copy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/v1/waitlist", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        status: 429,
        message: "Too many tries. Please wait a few minutes and try again.",
        code: "TOO_MANY_TRIES",
        data: null,
      }),
    }),
  );
  await page.goto("/");
  await page.locator("#hero-email").fill("tester@example.com");
  await page.locator('form:has(#hero-email) button[type="submit"]').click();
  await expect(page.locator("#hero-email-status")).toHaveText(
    "Too many tries. Please wait a few minutes and try again.",
  );
});

test("posts natively without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.route("**/api/v1/waitlist", (route) =>
    route.fulfill({ status: 303, headers: { location: "/waitlist?status=joined" } }),
  );
  await page.goto("/");
  await page.locator("#hero-email").fill("tester@example.com");
  await page.locator('form:has(#hero-email) button[type="submit"]').click();
  await page.waitForURL("**/waitlist?status=joined");
  await expect(page.locator(".waitlist-page-status")).toHaveText(WAITLIST_SUCCESS_COPY);
  await context.close();
});

test("header button jumps to the closing form and focuses it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const cta = page.locator("[data-header-cta]");
  await expect(cta).toBeVisible();
  await cta.click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ""), { timeout: 5_000 })
    .toBe("join-email");
});
