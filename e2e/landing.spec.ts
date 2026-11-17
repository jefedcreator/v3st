import { test, expect } from "./test";

for (const [width, height] of [
  [360, 800],
  [390, 844],
  [768, 1024],
  [1440, 1000],
] as const) {
  test(`responsive demo and local logo integrity at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Start with naira.See investing clearly.",
    );
    expect(
      await page
        .locator("html")
        .evaluate((el) => el.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await page.locator("#ecosystem").scrollIntoViewIfNeeded();
    const images = page.locator("#ecosystem img");
    await expect(images).toHaveCount(12);
    for (const img of await images.all()) {
      await expect
        .poll(() =>
          img.evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true);
      expect(await img.getAttribute("src")).toMatch(
        /^(\/brands\/|\/_next\/image)/,
      );
    }
    await page.locator("#demo").scrollIntoViewIfNeeded();
    const demo = page.locator("#demo");
    await expect(demo.getByText("₦100,000", { exact: true })).toBeVisible();
    await expect(demo.getByText("66.000000", { exact: true })).toBeVisible();
    await demo.getByRole("tab", { name: "Explore stocks" }).click();
    await demo
      .getByRole("button", { name: "Test Stock B", exact: true })
      .click();
    await expect(
      demo.getByText("1.25", { exact: false }).first(),
    ).toBeVisible();
    await demo.getByRole("tab", { name: "Optional strategies" }).click();
    await expect(
      demo.getByRole("heading", { name: "No strategy selected" }),
    ).toBeVisible();
    await demo.getByRole("button", { name: "Open strategy example" }).click();
    await expect(demo.getByText("₦5,000", { exact: true })).toBeVisible();
    await demo
      .getByRole("button", { name: "Zero income", exact: true })
      .click();
    await expect(demo.getByText("₦0", { exact: true })).toBeVisible();
    await demo
      .getByRole("button", { name: "Principal loss", exact: true })
      .click();
    await expect(demo.getByText("−₦2,000", { exact: true })).toBeVisible();
    await expect(demo.getByText("₦18,000", { exact: true })).toBeVisible();
    await demo.getByRole("tab", { name: "Review proceeds" }).click();
    await expect(demo.getByText("₦4,900", { exact: true })).toBeVisible();
    await demo
      .getByRole("button", { name: "Below minimum", exact: true })
      .click();
    await expect(
      demo.getByText("₦1,999.99", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      demo.getByText("Below minimum. Rolls over with no payout fee charged."),
    ).toBeVisible();
    await demo.getByRole("button", { name: "At minimum", exact: true }).click();
    await expect(demo.getByText("₦1,900", { exact: true })).toBeVisible();
    await demo.getByRole("button", { name: "Reinvest", exact: true }).click();
    await expect(
      demo.getByRole("heading", { name: "Reinvestment comparison" }),
    ).toBeVisible();
    await expect(
      demo.getByText("Example bank · account •••• 1234"),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Pause animations", exact: true })
      .click();
    await expect(
      demo.getByRole("button", { name: "Reinvest", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await demo.getByRole("button", { name: "Reset demo" }).click();
    await expect(demo.getByRole("tab", { name: "Add naira" })).toBeFocused();
    await expect(demo.getByText("₦100,000", { exact: true })).toBeVisible();
    await demo.getByRole("tab", { name: "Explore stocks" }).click();
    await expect(
      demo.getByRole("button", { name: "Test Stock A", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await demo.getByRole("tab", { name: "Review proceeds" }).click();
    await expect(
      demo.getByRole("button", { name: "Payout", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      demo.getByRole("button", { name: "Qualifying", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await demo.getByRole("tab", { name: "Optional strategies" }).click();
    await expect(
      demo.getByRole("heading", { name: "No strategy selected" }),
    ).toBeVisible();
    await page.reload();
    await expect(demo.getByRole("tab", { name: "Add naira" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      await page
        .locator("html")
        .evaluate((el) => el.scrollWidth <= innerWidth + 1),
    ).toBe(true);
  });
}

test("anchors, skip link, tab keyboard and FAQ work", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const hrefs = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) => [
      ...new Set(links.map((link) => link.getAttribute("href")!)),
    ]);
  for (const href of hrefs) {
    expect(await page.locator(href).count(), href).toBe(1);
  }
  await page.locator('footer a[href="#how-it-works"]').click();
  await expect(page.locator("#how-it-works")).toBeInViewport();
  await page.locator('footer nav a[href="#demo"]').click();
  const tab = page.getByRole("tab", { name: "Add naira" });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Explore stocks" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Review proceeds" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tab).toBeFocused();
  await page.locator("#faq").scrollIntoViewIfNeeded();
  const question = page.locator("#faq summary").first();
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#faq details").first()).toHaveAttribute(
    "open",
    "",
  );
});

test("mobile sheet traps focus, closes on Escape and restores trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("v3st.");
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Explore a demo" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#demo")).toBeInViewport();
  expect(
    await page.locator("body").evaluate((el) => getComputedStyle(el).overflow),
  ).not.toBe("hidden");
});

test("ticker controls and diagram have no financial side effects", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".market-ticker").scrollIntoViewIfNeeded();
  const track = page.locator(".ticker-track");
  await expect
    .poll(() => track.evaluate((el) => getComputedStyle(el).animationDuration))
    .toBe("27s");
  expect(
    await page.locator(".ticker-viewport").getAttribute("aria-hidden"),
  ).toBe("true");
  await page.getByRole("button", { name: "Pause market examples" }).click();
  await expect
    .poll(() => track.evaluate((el) => getComputedStyle(el).animationPlayState))
    .toBe("paused");
  await page.getByRole("button", { name: "Resume market examples" }).click();
  await page.mouse.move(0, 0);
  await page.locator("#main-content").focus();
  await page.locator(".market-ticker").scrollIntoViewIfNeeded();
  await expect
    .poll(() => track.evaluate((el) => getComputedStyle(el).animationPlayState))
    .toBe("running");
  const startY = await track.evaluate(
    (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
  );
  await expect
    .poll(() =>
      track.evaluate(
        (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
      ),
    )
    .toBeLessThan(startY);
  await page.locator(".flow-diagram").scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Highlight Choose a strategy" })
    .focus();
  await page.locator("#demo").scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Optional strategies" }).click();
  await expect(
    page.getByRole("heading", { name: "No strategy selected" }),
  ).toBeVisible();
});

test("no WebGL still preserves hero and demo", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    )!.value as HTMLCanvasElement["getContext"];
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof original>
      ) {
        if (String(args[0]).startsWith("webgl")) return null;
        return original.apply(this, args);
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".hero-background > svg")).toBeVisible();
  await expect(page.locator(".fluid-background")).toHaveAttribute(
    "data-fluid-state",
    "fallback",
  );
  await page.locator("#demo").scrollIntoViewIfNeeded();
  await expect(page.getByRole("tab", { name: "Add naira" })).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("mobile anchors, walkthrough and FAQ remain usable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.locator('.nojs-nav a[href="#demo"]').click();
    await expect(page.locator("#demo")).toBeInViewport();
    // Playwright's text selector deliberately excludes noscript descendants.
    const explanation = page.locator("#demo .nojs-demo");
    await expect(explanation).toBeVisible();
    await expect(explanation).toHaveText(
      "This walkthrough is available without JavaScript. Enable JavaScript to try the interactive examples.",
    );
    await page.locator("#faq summary").first().click();
    await expect(page.locator("#faq details").first()).toHaveAttribute(
      "open",
      "",
    );
  });
});

test("context loss retains the static artwork and usable controls", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator(".fluid-background canvas");
  await expect(page.locator(".fluid-background")).toHaveAttribute(
    "data-fluid-state",
    "ready",
  );
  await canvas.evaluate((el) =>
    el.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(page.locator(".fluid-background")).toHaveAttribute(
    "data-fluid-state",
    "fallback",
  );
  await expect(page.locator(".hero-background > svg")).toBeVisible();
  await page.locator("#demo").scrollIntoViewIfNeeded();
  await expect(page.getByRole("tab", { name: "Add naira" })).toBeVisible();
});

test("short mobile sheet keeps every navigation item scrollable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((el) => getComputedStyle(el).overflowY)).toBe(
    "auto",
  );
  const link = dialog.getByRole("link", { name: "FAQs" });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  await link.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#faq")).toBeInViewport();
});
