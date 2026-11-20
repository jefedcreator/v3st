import type { Page } from "@playwright/test";

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
  // The sections, Join the waitlist, and the quiet Sign in link.
  await expect(page.locator(".nojs-nav a")).toHaveCount(NAV_LINKS.length + 2);
  await expect(page.locator('.nojs-nav a[href="/signin"]')).toHaveText("Sign in");
  await context.close();
});

test("anchors and the skip link reach their sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  for (const link of NAV_LINKS) {
    await page.locator(`.desktop-nav a[href="${link.href}"]`).click();
    const anchor = link.href.replace(/^\//, "");
    // The plan's contract: the target heading's top lies between 0 and 120px.
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
    await expect
      .poll(
        async () => {
          const box = await heading.boundingBox();
          return box ? box.y : -1;
        },
        { timeout: 8_000 },
      )
      .toBeLessThanOrEqual(120);
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
  const trigger = page.getByRole("button", { name: "Menu", exact: true });
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

test("mobile sheet closes when a section link is chosen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "FAQ" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await page.locator("#faq h2").boundingBox())?.y ?? -1, { timeout: 8_000 })
    .toBeLessThanOrEqual(120);
});

test("ticker falls back to names when prices are unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const rows = page.locator(".ticker-list:not(.ticker-duplicate) .ticker-row");
  await expect(rows).toHaveCount(8);
  for (const row of await rows.all()) {
    expect(await row.textContent()).not.toContain("₦");
  }
  await expect(page.locator(".ticker-caption")).toHaveText(
    "Beta prices appear here when they're available.",
  );
});

// The real list; the mobile loop's aria-hidden duplicate is excluded.
const BUILT_WITH_LIST = "#built-with .built-with-row:not(.logo-marquee-duplicate)";

test("built-with row shows all 12 marks in order with valid dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const items = page.locator(`${BUILT_WITH_LIST} > li`);
  await expect(items).toHaveCount(12);
  await page.locator("#built-with").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (list) =>
      Array.from(document.querySelectorAll<HTMLImageElement>(`${list} img`)).every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    BUILT_WITH_LIST,
  );
  const alts = await page.locator(`${BUILT_WITH_LIST} img`).evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute("alt")),
  );
  expect(alts).toEqual(BRAND_NAMES.map((name) => `${name} logo`));
  const dims = await page.locator(`${BUILT_WITH_LIST} img`).evaluateAll((imgs) =>
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

// Row count of the real list: distinct item tops, within a couple of pixels.
async function builtWithRows(page: Page): Promise<number> {
  return page.evaluate((list) => {
    const tops = Array.from(document.querySelectorAll(`${list} > li`)).map((li) =>
      Math.round(li.getBoundingClientRect().top / 4),
    );
    return new Set(tops).size;
  }, BUILT_WITH_LIST);
}

test("built-with marks scroll in one horizontal row on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#built-with").scrollIntoViewIfNeeded();
  expect(await builtWithRows(page)).toBe(1);
  const track = page.locator(".logo-marquee-track");
  expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe("logo-marquee");
  expect(await track.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("42s");
  const duplicate = page.locator(".logo-marquee-duplicate");
  await expect(duplicate).toHaveAttribute("aria-hidden", "true");
  await expect(duplicate).toHaveAttribute("inert", "");
  // It moves on its own.
  const before = await track.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(() => track.evaluate((el) => getComputedStyle(el).transform), { timeout: 5_000 })
    .not.toBe(before);
});

test("built-with marks keep the wrapped grid from 768px up", async ({ page }) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator("#built-with").scrollIntoViewIfNeeded();
    expect(await builtWithRows(page), `${viewport.width}px`).toBeGreaterThan(1);
    expect(
      await page.locator(".logo-marquee-track").evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await expect(page.locator(".logo-marquee-duplicate")).toBeHidden();
  }
});

test("built-with row stays still and swipeable under reduced motion", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#built-with").scrollIntoViewIfNeeded();
  await expect(page.locator(".logo-marquee-duplicate")).toHaveCount(0);
  expect(
    await page.locator(".logo-marquee-track").evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  const scroller = await page.locator(".logo-marquee").evaluate((el) => ({
    overflowX: getComputedStyle(el).overflowX,
    scrollable: el.scrollWidth > el.clientWidth,
  }));
  expect(scroller).toEqual({ overflowX: "auto", scrollable: true });
  expect(await builtWithRows(page)).toBe(1);
  await context.close();
});

test("legal pages render each document and unknown slugs 404", async ({ page }) => {
  for (const slug of Object.keys(CUSTOMER_DOCUMENTS)) {
    const response = await page.goto(`/legal/${slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".legal-page h1")).toHaveText(CUSTOMER_DOCUMENTS[slug as keyof typeof CUSTOMER_DOCUMENTS].title);
  }
  const missing = await page.request.get("/legal/unknown");
  expect(missing.status()).toBe(404);
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

test("links to sign-in without prefetching it", async ({ page }) => {
  await page.goto("/");
  const link = page.locator(".header-signin");
  await expect(link).toHaveAttribute("href", "/signin");
  await link.focus();
  await expect(link).toBeFocused();
  await expect(page.locator("footer").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/signin",
  );
});
