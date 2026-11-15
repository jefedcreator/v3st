import { expect, test } from "@playwright/test";

const HERO_GROUPS = ["background", "heading", "copy", "actions", "rail"] as const;

async function scrollToProgress(page: import("@playwright/test").Page, progress: number) {
  await page.evaluate((p) => {
    const track = document.querySelector<HTMLElement>("[data-hero-track]");
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    window.scrollTo(0, window.scrollY + rect.top + scrollable * p);
  }, progress);
  await page.waitForTimeout(1200);
}

function groupOpacity(page: import("@playwright/test").Page, group: string) {
  return page
    .locator(`[data-hero-group="${group}"]`)
    .first()
    .evaluate((el) => Number(getComputedStyle(el).opacity));
}

test.describe("hero choreography", () => {
  test("intro settles to full opacity at the top of the page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.waitForTimeout(2600);
    for (const group of HERO_GROUPS) {
      expect(await groupOpacity(page, group), group).toBeGreaterThan(0.99);
    }
  });

  test("scroll handover fades hero groups in the captured order and reveals the header CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.waitForTimeout(2600);
    await scrollToProgress(page, 1);
    for (const group of HERO_GROUPS) {
      expect(await groupOpacity(page, group), group).toBeLessThan(0.01);
    }
    const cta = page.locator("[data-header-cta]");
    expect(await cta.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.99);
  });

  test("scrolling back up restores hero visibility", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.waitForTimeout(2600);
    await scrollToProgress(page, 1);
    expect(await groupOpacity(page, "heading")).toBeLessThan(0.01);
    await scrollToProgress(page, 0);
    expect(await groupOpacity(page, "heading")).toBeGreaterThan(0.99);
  });

  test("hero track is 160vh and following content overlaps by 45vh at normal sizes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const track = page.locator("[data-hero-track]");
    const height = await track.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(1000 * 1.59);
    expect(height).toBeLessThan(1000 * 1.61);
  });

  test("reduced motion uses ordinary flow without pinning", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForTimeout(600);
    const track = page.locator("[data-hero-track]");
    const position = await page.locator("[data-hero-stage]").evaluate(
      (el) => getComputedStyle(el).position,
    );
    expect(position).toBe("static");
    const height = await track.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThan(1000 * 1.2);
    for (const group of HERO_GROUPS) {
      expect(await groupOpacity(page, group), group).toBeGreaterThan(0.99);
    }
    await context.close();
  });
});
