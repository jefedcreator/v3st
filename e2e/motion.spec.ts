import type { Page } from "@playwright/test";

import { heroFrame, type HeroGroup } from "../src/components/landing/motion/contract";

import { expect, test } from "./test";

const GROUPS: HeroGroup[] = ["background", "heading", "copy", "actions", "rail"];

async function groupOpacity(page: Page, group: string): Promise<number> {
  return page.evaluate((name) => {
    const el = document.querySelector(`[data-hero-group="${name}"]`);
    return el ? Number(window.getComputedStyle(el).opacity) : -1;
  }, group);
}

async function waitOpacity(
  page: Page,
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

async function scrollToProgress(page: Page, progress: number) {
  await page.evaluate((target) => {
    const track = document.querySelector<HTMLElement>("[data-hero-track]");
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
          const root = document.querySelector<HTMLElement>("[data-landing]");
          return root ? Number(getComputedStyle(root).getPropertyValue("--header-cta")) : -1;
        }),
      { timeout: 8_000 },
    )
    .toBeGreaterThan(0.99);
  const cta = page.locator("[data-header-cta]");
  await expect(cta).toBeVisible();
  await cta.click();
  // Next's Link updates the URL inside a transition, so wait for the hash.
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#join");
});

test("deep link does not replay a blank hero", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#faq");
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const group of GROUPS) {
    await waitOpacity(page, group, 1);
  }
});

test("ticker moves upward over 36 seconds and pauses on hover", async ({ page }) => {
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
  await expect
    .poll(() => marquee.evaluate((el) => getComputedStyle(el).animationPlayState), {
      timeout: 5_000,
    })
    .toBe("running");
});

test("hero counters count up from zero on a fresh load", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Keep the fluid off: headless Chromium runs WebGL in software (SwiftShader),
  // which starves the main thread so badly that the 800ms count can finish
  // between two frames. The count is time-based, so the figures stay right;
  // this only keeps enough frames to observe the intermediate values.
  await page.addInitScript(() => {
    const proto = HTMLCanvasElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "getContext");
    const original = descriptor?.value as (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) => unknown;
    Object.defineProperty(proto, "getContext", {
      configurable: true,
      writable: true,
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === "webgl2" || type === "webgl") return null;
        return original.call(this, type, ...args);
      },
    });
  });
  // Record every value the first rail figure shows, from before hydration on,
  // so the short resting-zero window cannot be missed by polling, and whether
  // the intro actually ran (the rail faded to 0).
  await page.addInitScript(() => {
    const state = { seen: [] as string[], introPlayed: false };
    (window as unknown as { __rail: typeof state }).__rail = state;
    const record = () => {
      const text = document.querySelector('[data-hero-group="rail"] [data-figure]')?.textContent;
      if (text && state.seen.at(-1) !== text) state.seen.push(text);
      const root = document.querySelector<HTMLElement>("[data-landing]");
      if (root?.style.getPropertyValue("--hero-rail") === "0") state.introPlayed = true;
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  });
  await page.goto("/");
  // Wait until the choreography has hydrated and the rail has settled.
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-hero-fit", /true|false/, {
    timeout: 8_000,
  });
  await expect
    .poll(() => groupOpacity(page, "rail"), { timeout: 10_000 })
    .toBeGreaterThan(0.99);
  await expect
    .poll(() => page.locator('[data-hero-group="rail"] [data-figure]').first().textContent(), {
      timeout: 8_000,
    })
    .toBe("₦1,000");
  const rail = await page.evaluate(
    () => (window as unknown as { __rail: { seen: string[]; introPlayed: boolean } }).__rail,
  );
  // Server HTML holds the final value.
  expect(rail.seen[0]).toBe("₦1,000");
  expect(rail.seen.at(-1)).toBe("₦1,000");
  if (rail.introPlayed) {
    // The rail was hidden by the intro: the figure rested at zero, then counted.
    expect(rail.seen).toContain("₦0");
    expect(rail.seen.length).toBeGreaterThanOrEqual(3);
  } else {
    // Hydration was too late for the intro (a loaded machine): the contract
    // keeps the visible figure at its final value and never replays it.
    expect(rail.seen).toEqual(["₦1,000"]);
  }
});

test("counters expose only their final values to assistive technology", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const figure = page.locator('[data-hero-group="rail"] [data-figure]').first();
  await expect(figure).toHaveAttribute("aria-hidden", "true");
  await expect(figure.locator("xpath=..").locator(".sr-only")).toHaveText("₦1,000");
});

test("leaving the home page settles the header on other routes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-hero-fit", "true", {
    timeout: 8_000,
  });
  // At the top of the page the header button is still hidden by the hero.
  await expect(page.locator("[data-landing]")).toHaveAttribute("data-header-cta-hidden", "true");
  // Navigate client-side without scrolling, so the hero is still mid-intro or
  // at rest at the top (header button hidden) when it unmounts.
  await page.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('footer a[href="/legal/privacy"]')!.click(),
  );
  await page.waitForURL("**/legal/privacy");
  await expect(page.locator(".legal-page h1")).toHaveText("Privacy");
  const root = page.locator("[data-landing]");
  await expect(root).not.toHaveAttribute("data-header-cta-hidden", /.*/);
  await expect(root).not.toHaveAttribute("data-hero-fit", /.*/);
  expect(
    await root.evaluate((el) => getComputedStyle(el).getPropertyValue("--header-cta").trim()),
  ).toBe("1");
  await expect(page.locator("[data-header-cta]")).toBeVisible();
});

test("counters reach their final values", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const settle = (selector: string, want: string[]) =>
    expect
      .poll(() => page.locator(`${selector} [data-figure]`).allTextContents(), {
        timeout: 10_000,
      })
      .toEqual(want);
  // The hero rail counts in during the intro.
  await settle('[data-hero-group="rail"]', ["₦1,000", "8", "₦2,000"]);
  // Below-the-fold counters rest at zero until 35% visible, then count once.
  await page.locator(".safeguard-stats").scrollIntoViewIfNeeded();
  await settle(".safeguard-stats", ["₦0", "1%", "30 days"]);
});

test("diagram advances every 3.6 seconds, stops offscreen and resumes on return", async ({
  page,
}) => {
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
  // Offscreen, autoplay stops: longer than a 1080ms delay plus a 3600ms step.
  await page.evaluate(() => window.scrollTo(0, 0));
  const offscreenIndex = await activeIndex();
  await page.waitForTimeout(5_000);
  expect(await activeIndex()).toBe(offscreenIndex);
  // Back in view, it resumes (it used to stay stopped after the first exit).
  await page.locator("#how-it-works").scrollIntoViewIfNeeded();
  await expect.poll(activeIndex, { timeout: 8_000 }).not.toBe(offscreenIndex);
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
    const proto = HTMLCanvasElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "getContext");
    const original = descriptor?.value as (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) => unknown;
    Object.defineProperty(proto, "getContext", {
      configurable: true,
      writable: true,
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === "webgl2" || type === "webgl") return null;
        return original.call(this, type, ...args);
      },
    });
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  const glow = page.locator(".hero-background img");
  await expect(glow).toBeVisible();
  expect(await glow.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await context.close();
});

test("short viewport falls back to ordinary flow with the hero visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/");
  await expect
    .poll(() => page.locator("[data-landing]").getAttribute("data-hero-fit"), { timeout: 8_000 })
    .toBe("false");
  const position = await page
    .locator(".hero")
    .evaluate((el) => getComputedStyle(el).position);
  expect(position).not.toBe("sticky");
  // Ordinary flow never fades the copy: it stays readable at the top and
  // while the visitor scrolls down through the hero to reach the rail.
  for (const group of GROUPS) await waitOpacity(page, group, 1);
  await page.locator('[data-hero-group="rail"]').scrollIntoViewIfNeeded();
  for (const group of GROUPS) await waitOpacity(page, group, 1);
});

for (const viewport of [
  { width: 1440, height: 740 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`laptop viewport ${viewport.width}x${viewport.height} pins the hero and keeps it visible at the top`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const root = page.locator("[data-landing]");
    await expect(root).toHaveAttribute("data-hero-fit", "true", { timeout: 8_000 });
    // Once the intro has run, every group is visible and the header button is
    // still waiting for the handover (the blank-hero bug showed the opposite).
    for (const group of GROUPS) await waitOpacity(page, group, 1);
    await expect(root).toHaveAttribute("data-header-cta-hidden", "true");
    // Pinned and uncropped: the hero's copy fits inside the 100vh stage.
    const fits = await page.evaluate(() => {
      const inner = document.querySelector(".hero-inner")!.getBoundingClientRect();
      return inner.top >= -1 && inner.bottom <= window.innerHeight + 1;
    });
    expect(fits).toBe(true);
  });
}
