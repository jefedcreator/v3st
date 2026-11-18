import { heroFrame, type HeroGroup } from "../src/components/landing/motion/contract";

import { expect, test } from "./test";

const GROUPS: HeroGroup[] = ["background", "heading", "copy", "actions", "rail"];

async function groupOpacity(page: import("@playwright/test").Page, group: string): Promise<number> {
  return page.evaluate((name) => {
    const el = document.querySelector(`[data-hero-group="${name}"]`);
    return el ? Number(window.getComputedStyle(el).opacity) : -1;
  }, group);
}

async function waitOpacity(
  page: import("@playwright/test").Page,
  group: string,
  expected: number,
): Promise<void> {
  await expect
    .poll(
      async () => Math.abs((await groupOpacity(page, group)) - expected) <= 0.03,
      { timeout: 8_000 },
    )
    .toBe(true);
}

async function scrollToProgress(page: import("@playwright/test").Page, progress: number) {
  await page.evaluate((target) => {
    const track = document.querySelector("[data-hero-track]") as HTMLElement | null;
    if (!track) return;
    const span = track.getBoundingClientRect().height - window.innerHeight;
    window.scrollTo(0, target * span);
  }, progress);
}

test("hero track and overlap geometry at 1440x1000", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-hero-fit", "true", {
    timeout: 8_000,
  });
  const vh = await page.evaluate(() => window.innerHeight);
  const trackHeight = await page
    .locator("[data-hero-track]")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(trackHeight).toBeGreaterThanOrEqual(vh * 1.6 - 2);
  expect(trackHeight).toBeLessThanOrEqual(vh * 1.6 + 2);
  const afterTop = await page
    .locator(".landing-after-hero")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(afterTop).toBeGreaterThanOrEqual(vh * 1.15 - 2);
  expect(afterTop).toBeLessThanOrEqual(vh * 1.15 + 2);
});

test("hero opacities at progress 0, 0.3, 0.6 and 1 after settling, and reversal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-hero-fit", "true", {
    timeout: 8_000,
  });
  // Let the intro finish.
  await page.waitForTimeout(3400);
  for (const progress of [0, 0.3, 0.6, 1]) {
    await scrollToProgress(page, progress);
    const frame = heroFrame({ elapsedMs: 10_000, progress });
    for (const group of GROUPS) {
      await waitOpacity(page, group, frame[group]);
    }
  }
  // Scrolling back up restores the hero.
  await scrollToProgress(page, 0);
  for (const group of GROUPS) {
    await waitOpacity(page, group, 1);
  }
});

test("header button appears after handover", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-hero-fit", "true", {
    timeout: 8_000,
  });
  await page.waitForTimeout(3400);
  await scrollToProgress(page, 1);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.querySelector("[data-landing]") as HTMLElement;
          return Number(getComputedStyle(root).getPropertyValue("--header-cta"));
        }),
      { timeout: 8_000 },
    )
    .toBeGreaterThan(0.99);
  const cta = page.locator("[data-header-cta]");
  await expect(cta).toBeVisible();
  await cta.click();
  expect(await page.evaluate(() => window.location.hash)).toBe("#join");
});

test("deep link does not replay a blank hero", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#faq");
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const group of GROUPS) {
    await waitOpacity(page, group, 1);
  }
});

test("ticker moves upward over 36 seconds and pauses on hover and via the control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const marquee = page.locator(".ticker-marquee");
  await expect
    .poll(() => marquee.evaluate((el) => getComputedStyle(el).animationDuration), {
      timeout: 8_000,
    })
    .toBe("36s");
  await page.locator(".ticker-viewport").hover();
  await expect
    .poll(() => marquee.evaluate((el) => getComputedStyle(el).animationPlayState), {
      timeout: 5_000,
    })
    .toBe("paused");
  await page.mouse.move(10, 10);
  await page.locator('button[aria-label="Pause motion"]').click();
  await expect
    .poll(() => marquee.evaluate((el) => getComputedStyle(el).animationPlayState), {
      timeout: 5_000,
    })
    .toBe("paused");
  await expect(page.locator('button[aria-label="Play motion"]')).toBeVisible();
});

test("counters reach their final values", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const figures = page.locator("[data-figure]");
  await expect
    .poll(
      async () => {
        const texts = await figures.allTextContents();
        return ["₦1,000", "8", "₦2,000", "₦0", "1%", "30 days"].every((want) =>
          texts.includes(want),
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});

test("diagram advances every 3.6 seconds and stops when paused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.locator("#how-it-works").scrollIntoViewIfNeeded();
  const activeIndex = () =>
    page.evaluate(() => {
      const dots = Array.from(document.querySelectorAll(".journey-dot"));
      return dots.findIndex((dot) => dot.getAttribute("data-active") === "true");
    });
  await expect
    .poll(() => page.locator(".journey-diagram").getAttribute("data-entered"), { timeout: 8_000 })
    .toBe("true");
  const first = await activeIndex();
  await expect.poll(activeIndex, { timeout: 8_000 }).not.toBe(first);
  await page.locator('button[aria-label="Pause motion"]').click();
  const pausedIndex = await activeIndex();
  const transform = await page
    .locator(".ticker-marquee")
    .evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(2_000);
  expect(await activeIndex()).toBe(pausedIndex);
  expect(
    await page.locator(".ticker-marquee").evaluate((el) => getComputedStyle(el).transform),
  ).toBe(transform);
  await page.locator('button[aria-label="Play motion"]').click();
  await expect.poll(activeIndex, { timeout: 8_000 }).not.toBe(pausedIndex);
});

test("pause control is reachable by keyboard at 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const pause = page.locator('button[aria-label="Pause motion"]');
  await pause.focus();
  await expect(pause).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('button[aria-label="Play motion"]')).toBeVisible();
});

test("reduced motion renders ordinary flow", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-hero-fit", "false");
  await expect(page.locator("canvas")).toHaveCount(0);
  const animationName = await page
    .locator(".ticker-marquee")
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
  const figures = await page.locator("[data-figure]").allTextContents();
  expect(figures).toContain("₦1,000");
  expect(figures).toContain("30 days");
  await context.close();
});

test("WebGL unavailable keeps the static artwork", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  const glow = page.locator(".hero-background img");
  await expect(glow).toBeVisible();
  expect(await glow.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await context.close();
});

test("short viewport falls back to ordinary flow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/");
  await expect
    .poll(() => page.locator("[data-landing]").getAttribute("data-hero-fit"), { timeout: 8_000 })
    .toBe("false");
  const position = await page
    .locator(".hero")
    .evaluate((el) => getComputedStyle(el).position);
  expect(position).not.toBe("sticky");
});
