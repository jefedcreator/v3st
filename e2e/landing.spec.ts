import { CUSTOMER_DOCUMENTS } from "../src/backend/content/documents";
import { NAV_LINKS } from "../src/components/landing/nav-links";
import { WAITLIST_SUCCESS_COPY } from "../src/components/landing/waitlist-status";

import { expect, test } from "./test";

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

const SECTION_HEADINGS: [string, string][] = [
  ["#stocks", "Invest in companies you already know."],
  ["#built-with", "Built to work with"],
  ["#earn", "Put your money to work."],
  ["#how-it-works", "How V3ST works."],
  ["#safeguards", "Built to show its work."],
  ["#faq", "Frequently asked questions."],
];

const BRAND_NAMES = [
  "Yellow Card",
  "Paycrest",
  "Privy",
  "Coinbase",
  "Base",
  "Circle (USDC)",
  "Hydrex",
  "o1 Exchange",
  "Bankr",
  "Stonks Exchange",
  "BaseStonk",
  "Feel.cash",
];

test("renders every section from server HTML without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("h1#hero-title")).toHaveText("Invest. Earn. Harvest.");
  for (const [anchor, heading] of SECTION_HEADINGS) {
    await expect(page.locator(`${anchor} h2`).first()).toHaveText(heading);
  }
  const forms = page.locator('form[method="post"][action="/api/v1/waitlist"]');
  await expect(forms).toHaveCount(2);
  await expect(page.locator("#hero-email")).toBeVisible();
  await expect(page.locator("#join-email")).toBeVisible();
  const firstFaq = page.locator("details.faq-item").first();
  await firstFaq.locator("summary").click();
  await expect(firstFaq).toHaveAttribute("open", "");
  await expect(page.locator(".nojs-nav a")).toHaveCount(NAV_LINKS.length + 1);
  await context.close();
});

test("anchors and the skip link reach their sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  for (const link of NAV_LINKS) {
    await page.locator(`.desktop-nav a[href="${link.href}"]`).click();
    const anchor = link.href.replace(/^\//, "");
    const heading = page.locator(`${anchor} h2`).first();
    await expect
      .poll(
        async () => {
          const box = await heading.boundingBox();
          return box ? box.y : -1;
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThanOrEqual(0);
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThanOrEqual(120);
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ""), { timeout: 5_000 })
    .toBe("main-content");
});

test("mobile sheet traps focus, closes on Escape and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.locator('button[aria-label="Open menu"]');
  await trigger.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && document.querySelector('[role="dialog"]')?.contains(active));
    });
    expect(inside).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("ticker falls back to names when prices are unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const rows = page.locator(".ticker-row");
  await expect(rows).toHaveCount(8);
  for (const row of await rows.all()) {
    expect(await row.textContent()).not.toContain("₦");
  }
  await expect(page.locator(".ticker-caption")).toHaveText(
    "Beta prices appear here when they're available.",
  );
});

test("built-with row shows all 12 marks in order with valid dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const items = page.locator("#built-with ul li");
  await expect(items).toHaveCount(12);
  const alts = await page.locator("#built-with img").evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute("alt")),
  );
  expect(alts).toEqual(BRAND_NAMES.map((name) => `${name} logo`));
  const dims = await page.locator("#built-with img").evaluateAll((imgs) =>
    imgs.map((img) => ({
      attr: Boolean(img.getAttribute("width")) && Boolean(img.getAttribute("height")),
      loaded: (img as HTMLImageElement).naturalWidth > 0,
    })),
  );
  for (const dim of dims) {
    expect(dim.attr).toBe(true);
    expect(dim.loaded).toBe(true);
  }
});

test("legal pages render each document and unknown slugs 404", async ({ page }) => {
  for (const slug of Object.keys(CUSTOMER_DOCUMENTS)) {
    const response = await page.goto(`/legal/${slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".legal-page h1")).toHaveText(CUSTOMER_DOCUMENTS[slug as keyof typeof CUSTOMER_DOCUMENTS].title);
  }
  const missing = await page.goto("/legal/unknown");
  expect(missing?.status()).toBe(404);
});

test("waitlist result page shows status copy", async ({ page }) => {
  await page.goto("/waitlist?status=joined");
  await expect(page.locator(".waitlist-page-status")).toHaveText(WAITLIST_SUCCESS_COPY);
  await page.goto("/waitlist?status=too_many_tries");
  await expect(page.locator(".waitlist-page-status")).toHaveText(
    "Too many tries. Please wait a few minutes and try again.",
  );
  await page.goto("/waitlist?status=check_details");
  await expect(page.locator(".waitlist-page-status")).toHaveText(
    "Enter a valid email address.",
  );
});

test("no naira glyph comes from a fallback font", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const widths = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const family = getComputedStyle(document.body).fontFamily;
    const measure = (fallback: string) => {
      ctx.font = `16px ${family}, ${fallback}`;
      return ctx.measureText("₦").width;
    };
    return { serif: measure("serif"), monospace: measure("monospace") };
  });
  expect(widths).not.toBeNull();
  expect(widths!.serif).toBe(widths!.monospace);
});

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow or clipped figures at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const clipped = Array.from(document.querySelectorAll("[data-figure]")).some((el) => {
        const rect = el.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      });
      return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, clipped };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
    expect(overflow.clipped).toBe(false);
  });
}
