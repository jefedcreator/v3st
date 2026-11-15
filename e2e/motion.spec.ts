import { expect, test } from "./test";

test("hero geometry, handover and reversal follow native scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const hero = page.locator(".hero-track");
  await expect(hero).toHaveAttribute("data-fit", "true");
  await expect
    .poll(() => hero.evaluate((el) => el.getBoundingClientRect().height))
    .toBeCloseTo(1600, 0);
  await expect
    .poll(() =>
      page
        .locator('[data-hero-group="rail"]')
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBeGreaterThan(0.99);
  const heading = page.locator('[data-hero-group="heading"]');
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect
    .poll(() => heading.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(0.01);
  await expect
    .poll(() =>
      page
        .locator(".header-cta")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBeGreaterThan(0.99);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() => heading.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.99);
});

test("deep entry and browser history preserve target visibility", async ({
  page,
}) => {
  await page.goto("/#demo");
  await expect(page.locator("#demo")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#demo")).toBeInViewport();
  await page.locator("footer a[href='#faq']").click();
  await expect(page.locator("#faq")).toBeInViewport();
  await page.goBack();
  await expect(page.locator("#demo")).toBeInViewport();
  await page.goForward();
  await expect(page.locator("#faq")).toBeInViewport();
});

test("reduced motion and short heights use readable ordinary flow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".hero-track")).toHaveAttribute(
    "data-fit",
    "false",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 768, height: 420 });
  await expect(page.locator(".hero-track")).toHaveAttribute(
    "data-fit",
    "false",
  );
  expect(
    await page
      .locator(".hero-stage")
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("relative");
});
