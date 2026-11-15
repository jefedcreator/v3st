import { expect, test } from "@playwright/test";

const ANCHORS = [
  "#how-it-works",
  "#explore",
  "#ecosystem",
  "#demo",
  "#friday",
  "#faq",
] as const;

test.describe("landing shell", () => {
  test("persistent beta badge and skip link are present", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText("Beta · Test funds only").first(),
    ).toBeVisible();
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeInViewport();
    await skip.focus();
    await expect(skip).toBeVisible();
  });

  test("every header/footer anchor lands on a visible section", async ({
    page,
  }) => {
    await page.goto("/");
    for (const anchor of ANCHORS) {
      const target = page.locator(anchor);
      await expect(target, anchor).toBeVisible();
      await page.locator(`a[href="${anchor}"]`).first().click();
      await expect(target, anchor).toBeInViewport();
    }
  });

  test("deep-link entry to #demo does not scroll back to top or replay a blank hero", async ({
    page,
  }) => {
    await page.goto("/#demo");
    await expect(page.locator("#demo")).toBeInViewport();
    const demoTop = await page.locator("#demo").evaluate((el) => el.getBoundingClientRect().top);
    expect(demoTop).toBeLessThan(200);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: /demo/i }).first()).toBeVisible();
  });

  test("Back/Forward keeps anchored content visible", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href="#faq"]').first().click();
    await expect(page.locator("#faq")).toBeInViewport();
    await page.goBack();
    await expect(page.locator("#top")).toBeInViewport();
    await page.goForward();
    await expect(page.locator("#faq")).toBeInViewport();
  });

  test("mobile sheet opens, traps and closes with Escape restoring focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Demo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("mobile sheet closes when an anchor is selected", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "FAQs" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("#faq")).toBeInViewport();
  });

  test("no-JavaScript context keeps navigation and walkthrough usable", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Start with naira/i })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary without JavaScript" }),
    ).toBeVisible();
    await page.locator('a[href="#demo"]').first().click();
    await expect(page.locator("#demo")).toBeInViewport();
    await expect(
      page.getByText(/available without JavaScript/i).first(),
    ).toBeVisible();
    await context.close();
  });

  test("page issues no API, provider or external requests", async ({ page }) => {
    const violations: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("/api/") ||
        url.includes("/v1/") ||
        url.includes("/webhooks/") ||
        !url.startsWith("http://127.0.0.1:3107")
      ) {
        if (request.resourceType() !== "document" || !url.startsWith("http://127.0.0.1:3107")) {
          violations.push(url);
        }
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    expect(violations).toEqual([]);
  });
});
