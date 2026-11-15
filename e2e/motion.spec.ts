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
  // Use the visible fixed navigation: auto-scrolling to the footer first
  // would legitimately replace the previous history entry's scroll position.
  await page.locator(".desktop-nav a[href='#faq']").click();
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
  const pause = page.getByRole("button", {
    name: "Pause animations",
    exact: true,
  });
  await expect(pause).toBeVisible();
  const pauseBox = await pause.boundingBox();
  expect(pauseBox).not.toBeNull();
  expect(pauseBox!.width).toBe(44);
  expect(pauseBox!.height).toBe(44);
  expect(pauseBox!.y + pauseBox!.height).toBeLessThan(96);
});

test("normal mobile hero retains measured choreography when it fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero-track")).toHaveAttribute("data-fit", "true");
  expect(
    await page
      .locator(".hero-track")
      .evaluate(
        (el) =>
          Math.abs(el.getBoundingClientRect().height - innerHeight * 1.6) < 2,
      ),
  ).toBe(true);
  expect(
    await page
      .locator(".landing-content")
      .evaluate(
        (el) =>
          Math.abs(
            parseFloat(getComputedStyle(el).marginTop) + innerHeight * 0.45,
          ) < 2,
      ),
  ).toBe(true);
  const rail = await page.locator(".hero-rail").boundingBox();
  const control = await page.locator(".motion-control").boundingBox();
  expect(rail).not.toBeNull();
  expect(control).not.toBeNull();
  expect(rail!.y + rail!.height).toBeLessThan(control!.y - 8);
});

test("focused fading actions stay visible and live reduced motion removes pinning", async ({
  page,
}) => {
  await page.goto("/");
  const action = page.locator(".hero-actions a").first();
  await action.focus();
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect
    .poll(() =>
      page
        .locator(".hero-actions")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".hero-track")).toHaveAttribute(
    "data-fit",
    "false",
  );
  await expect
    .poll(() =>
      page
        .locator(".landing-content")
        .evaluate((el) => getComputedStyle(el).marginTop),
    )
    .toBe("0px");
  await expect(action).toBeVisible();
});

test("hero opacity ordering follows the captured progress checkpoints", async ({
  page,
}) => {
  await page.goto("/");
  const groups = ["actions", "rail", "copy", "heading", "background"];
  await expect
    .poll(() =>
      page
        .locator('[data-hero-group="rail"]')
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBeGreaterThan(0.99);
  for (const progress of [0, 0.3, 0.6, 1]) {
    await page.evaluate((p) => window.scrollTo(0, p * 600), progress);
    await expect
      .poll(() =>
        page
          .locator(".landing")
          .evaluate((el) =>
            Number(
              (el as HTMLElement).style.getPropertyValue("--hero-ctaReveal"),
            ),
          ),
      )
      .toBeCloseTo(progress <= 0.3 ? 0 : progress === 0.6 ? 0.393586 : 1, 2);
    if (progress === 0 || progress === 0.3 || progress === 1) {
      for (const group of groups) {
        await expect
          .poll(() =>
            page
              .locator(`[data-hero-group="${group}"]`)
              .evaluate((el) => Number(getComputedStyle(el).opacity)),
          )
          .toBeCloseTo(progress === 1 ? 0 : 1, 2);
      }
    }
    if (progress === 0.6) {
      await expect
        .poll(() =>
          page
            .locator('[data-hero-group="actions"]')
            .evaluate((el) => Number(getComputedStyle(el).opacity)),
        )
        .toBeLessThan(0.05);
      const opacities = await Promise.all(
        groups.map((group) =>
          page
            .locator(`[data-hero-group="${group}"]`)
            .evaluate((el) => Number(getComputedStyle(el).opacity)),
        ),
      );
      expect(opacities[2]).toBeLessThan(opacities[3]!);
      expect(opacities[3]).toBeLessThanOrEqual(opacities[4]!);
    }
  }
});

test("completed diagram entrance never replays on pause and resume", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".flow-diagram").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".flow-node")
        .last()
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("none");
  await page
    .getByRole("button", { name: "Pause animations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume animations", exact: true })
    .click();
  expect(
    await page
      .locator(".flow-node")
      .last()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
