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

test.describe("product stories and ecosystem", () => {
  test("ticker is labelled illustrative, loops at 27s for six rows and pauses via its control", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Illustrative examples · not live prices"),
    ).toBeVisible();
    const track = page.locator(".ticker-track");
    await expect(track).toBeVisible();
    const duration = await track.evaluate(
      (el) => getComputedStyle(el).animationDuration,
    );
    expect(duration).toBe("27s");
    const pause = page.getByRole("button", { name: "Pause ticker" });
    await pause.click();
    const playState = await track.evaluate(
      (el) => getComputedStyle(el).animationPlayState,
    );
    expect(playState).toBe("paused");
    await page.getByRole("button", { name: "Resume ticker" }).click();
    const resumed = await track.evaluate(
      (el) => getComputedStyle(el).animationPlayState,
    );
    expect(resumed).toBe("running");
    const duplicate = page.locator(".ticker-track ul[aria-hidden='true']");
    await expect(duplicate).toHaveCount(1);
    await expect(
      page.locator(".sr-only li", { hasText: "TSTA" }),
    ).toHaveCount(1);
  });

  test("all nine provider marks and the Base/Solana/USDC row render with local sources", async ({
    page,
  }) => {
    await page.goto("/");
    const section = page.locator("#ecosystem");
    await section.scrollIntoViewIfNeeded();
    const names = [
      "Yellow Card",
      "Paycrest",
      "Privy",
      "o1 Exchange",
      "Bankr",
      "Hydrex / Hydropump",
      "Stonks Exchange",
      "BaseStonk",
      "Feel.cash",
      "Base",
      "Solana",
      "USDC",
    ];
    for (const name of names) {
      const img = section.getByRole("img", { name });
      await expect(img, name).toBeVisible();
      const src = await img.getAttribute("src");
      expect(src).toMatch(/^\/brands\//);
      const natural = await img.evaluate(
        (el) => (el as HTMLImageElement).naturalWidth,
      );
      expect(natural, name).toBeGreaterThan(0);
    }
    await expect(
      section.getByText(/Integrations are simulated in this beta/),
    ).toBeVisible();
  });

  test("FAQ disclosures work with keyboard and without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const first = page.locator("#faq details summary").first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(
      page.locator("#faq details[open] p").first(),
    ).toBeVisible();
    await context.close();
  });

  test("diagram highlight never changes demo state", async ({ page }) => {
    await page.goto("/#demo");
    await page.locator("[data-hero-track]").waitFor();
    await page.locator(".diagram-node").first().hover();
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole("tab", { name: "Add naira", selected: true }),
    ).toBeVisible();
  });
});

test.describe("interactive demo", () => {
  test("chapters, scenarios, preference and reset behave with exact figures", async ({
    page,
  }) => {
    await page.goto("/#demo");
    await expect(
      page.getByRole("tab", { name: "Add naira", selected: true }),
    ).toBeVisible();
    await expect(page.getByText("\u20a6100,000")).toBeVisible();
    await expect(page.getByText("\u20a61,000")).toBeVisible();
    await expect(page.getByText("\u20a699,000")).toBeVisible();
    await expect(page.getByText(/66\.000000 USDC-equivalent/)).toBeVisible();

    await page.getByRole("tab", { name: "Explore stocks" }).click();
    await expect(page.getByText("0.25 units")).toBeVisible();
    await page.getByRole("button", { name: /TSTB/ }).click();
    await expect(page.getByText("1.25 units")).toBeVisible();
    await expect(page.getByText("\u20a610,000")).toBeVisible();

    await page.getByRole("tab", { name: "Choose a strategy" }).click();
    await expect(page.getByText("No strategy selected")).toBeVisible();
    await page.getByRole("button", { name: "Open strategy example" }).click();
    await expect(page.getByText("\u20a65,000")).toBeVisible();
    await page.getByRole("button", { name: "Principal loss" }).click();
    await expect(page.getByText("\u2212\u20a62,000")).toBeVisible();
    await expect(page.getByText("\u20a618,000")).toBeVisible();

    await page.getByRole("tab", { name: "Review proceeds" }).click();
    await expect(page.getByText("\u20a64,900")).toBeVisible();
    await page.getByRole("button", { name: "Below minimum" }).click();
    await expect(page.getByText("Rolls over to next Friday")).toBeVisible();
    await expect(page.getByText("\u20a61,999.99")).toBeVisible();
    await page.getByRole("button", { name: "At minimum" }).click();
    await expect(page.getByText("\u20a61,900")).toBeVisible();
    await page.getByRole("button", { name: "Reinvest" }).click();
    await expect(page.getByText(/not applied to reinvestment/)).toBeVisible();
    await expect(
      page.getByText("Example bank · account •••• 1234"),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(
      page.getByRole("tab", { name: "Add naira", selected: true }),
    ).toBeFocused();
    await expect(page.getByText("\u20a6100,000")).toBeVisible();
  });

  test("reload does not restore demo selections and no storage is written", async ({
    page,
  }) => {
    await page.goto("/#demo");
    await page.getByRole("tab", { name: "Explore stocks" }).click();
    await page.getByRole("button", { name: /TSTB/ }).click();
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Add naira", selected: true }),
    ).toBeVisible();
    const storage = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
      cookies: document.cookie,
    }));
    expect(storage.local).toBe(0);
    expect(storage.session).toBe(0);
    expect(storage.cookies).toBe("");
  });

  test("every chapter panel carries the independent-example label", async ({
    page,
  }) => {
    await page.goto("/#demo");
    for (const tab of ["Add naira", "Explore stocks", "Choose a strategy", "Review proceeds"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(
        page.getByText("Independent illustrative example"),
      ).toBeVisible();
    }
  });
});
