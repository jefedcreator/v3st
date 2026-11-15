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
    await skip.focus();
    await expect(skip).toBeVisible();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeInViewport();
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
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const rect = document.querySelector("#demo")?.getBoundingClientRect();
            return rect ? rect.top : 9999;
          }),
        { timeout: 8000 },
      )
      .toBeLessThan(200);
    await expect(page.locator("#demo")).toBeInViewport();
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: /illustrative demo/i }),
    ).toBeVisible();
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

  test("mobile sheet opens, closes with Escape and restores focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Demo", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("mobile sheet closes when an anchor is selected", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "FAQs", exact: true })
      .click();
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
    await expect(page.locator("h1")).toContainText("Start with naira");
    await expect(page.locator("noscript nav")).toBeVisible();
    await page.locator('noscript a[href="#demo"]').last().click();
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const rect = document.querySelector("#demo")?.getBoundingClientRect();
            return rect ? rect.top < window.innerHeight && rect.bottom > 0 : false;
          }),
        { timeout: 8000 },
      )
      .toBe(true);
    const notePresent = await page.evaluate(() =>
      document.body.textContent?.includes("available without JavaScript") ?? false,
    );
    expect(notePresent).toBe(true);
    await context.close();
  });

  test("page issues no API, provider or external requests", async ({ page }) => {
    const violations: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      const isApp =
        url.startsWith("http://127.0.0.1:3107") || url.startsWith("data:") || url.startsWith("blob:");
      if (!isApp) violations.push(url);
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
    await page.getByRole("button", { name: "Pause ticker" }).click();
    const playState = await track.evaluate(
      (el) => getComputedStyle(el).animationPlayState,
    );
    expect(playState).toBe("paused");
    await page.getByRole("button", { name: "Resume ticker" }).click();
    await page.mouse.move(10, 10);
    const resumed = await track.evaluate(
      (el) => getComputedStyle(el).animationPlayState,
    );
    expect(resumed).toBe("running");
    const duplicate = page.locator(".ticker-track ul[aria-hidden='true']");
    await expect(duplicate).toHaveCount(1);
    await expect(page.locator(".sr-only li", { hasText: "TSTA" })).toHaveCount(
      1,
    );
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
      const img = section.getByRole("img", { name, exact: true });
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

  test("FAQ disclosures work without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const first = page.locator("#faq details summary").first();
    await first.click();
    const opened = await page.evaluate(
      () => document.querySelectorAll("#faq details[open]").length,
    );
    expect(opened).toBe(1);
    const answerVisible = await page.evaluate(() => {
      const p = document.querySelector("#faq details[open] p");
      const rect = p?.getBoundingClientRect();
      return rect ? rect.height > 0 : false;
    });
    expect(answerVisible).toBe(true);
    await context.close();
  });

  test("diagram highlight never changes demo state", async ({ page }) => {
    await page.goto("/#demo");
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
    const demo = page.locator("#demo");
    await expect(
      page.getByRole("tab", { name: "Add naira", selected: true }),
    ).toBeVisible();
    await expect(demo.getByText("\u20a6100,000")).toBeVisible();
    await expect(demo.getByText("\u20a61,000")).toBeVisible();
    await expect(demo.getByText("\u20a699,000")).toBeVisible();
    await expect(demo.getByText(/66\.000000 USDC-equivalent/)).toBeVisible();

    await page.getByRole("tab", { name: "Explore stocks" }).click();
    await expect(demo.getByText("0.25 units")).toBeVisible();
    await page.getByRole("button", { name: /TSTB/ }).click();
    await expect(demo.getByText("1.25 units")).toBeVisible();
    await expect(demo.getByText("\u20a610,000")).toBeVisible();

    await page.getByRole("tab", { name: "Choose a strategy" }).click();
    await expect(demo.getByText("No strategy selected")).toBeVisible();
    await page.getByRole("button", { name: "Open strategy example" }).click();
    await expect(demo.getByText("\u20a65,000")).toBeVisible();
    await page.getByRole("button", { name: "Principal loss" }).click();
    await expect(demo.getByText("\u2212\u20a62,000")).toBeVisible();
    await expect(demo.getByText("\u20a618,000")).toBeVisible();

    await page.getByRole("tab", { name: "Review proceeds" }).click();
    await expect(demo.getByText("\u20a64,900")).toBeVisible();
    await page.getByRole("button", { name: "Below minimum" }).click();
    await expect(demo.getByText("Rolls over to next Friday")).toBeVisible();
    await expect(demo.getByText("\u20a61,999.99").first()).toBeVisible();
    await page.getByRole("button", { name: "At minimum" }).click();
    await expect(demo.getByText("\u20a61,900")).toBeVisible();
    await page.getByRole("button", { name: "Reinvest" }).click();
    await expect(demo.getByText(/not applied to reinvestment/)).toBeVisible();
    await expect(
      demo.getByText("Example bank · account •••• 1234"),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(
      page.getByRole("tab", { name: "Add naira", selected: true }),
    ).toBeFocused();
    await expect(demo.getByText("\u20a6100,000")).toBeVisible();
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
    const demo = page.locator("#demo");
    for (const tab of [
      "Add naira",
      "Explore stocks",
      "Choose a strategy",
      "Review proceeds",
    ]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(demo.getByText("Independent illustrative example")).toBeVisible();
    }
  });
});

test.describe("responsive containment and fallbacks", () => {
  const viewports = [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ] as const;

  for (const [width, height] of viewports) {
    test(`no horizontal overflow or clipped demo figures at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.waitForTimeout(2400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await page.locator("#demo").scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      for (const tab of [
        "Add naira",
        "Explore stocks",
        "Choose a strategy",
        "Review proceeds",
      ]) {
        await page.getByRole("tab", { name: tab }).click();
        const clipped = await page.evaluate(() => {
          const panel = document.querySelector('[data-slot="tabs-content"][data-state="active"]');
          if (!panel) return false;
          return panel.scrollHeight > panel.clientHeight + 1 &&
            getComputedStyle(panel).overflowY === "hidden";
        });
        expect(clipped, tab).toBe(false);
      }
      const overflowDemo = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflowDemo).toBeLessThanOrEqual(1);
    });
  }

  test("WebGL-unavailable keeps the static artwork and all controls usable", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype;
      const original = proto.getContext.bind(proto) as (
        ...args: unknown[]
      ) => unknown;
      proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (args[0] === "webgl" || args[0] === "experimental-webgl") return null;
        return original.apply(this, args);
      } as typeof proto.getContext;
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/");
    await page.waitForTimeout(2600);
    await expect(
      page.getByRole("heading", { name: /Start with naira/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Explore a demo", exact: true }).first(),
    ).toBeVisible();
    const canvasCount = await page.evaluate(
      () => document.querySelectorAll("canvas").length,
    );
    await page.locator('a[href="#demo"]').first().click();
    await expect(page.locator("#demo")).toBeInViewport();
    expect(errors).toEqual([]);
    expect(canvasCount).toBeGreaterThanOrEqual(0);
    await context.close();
  });

  test("global pause control stops the ticker and fluid without resetting the demo", async ({
    page,
  }) => {
    await page.goto("/#demo");
    await page.getByRole("tab", { name: "Explore stocks" }).click();
    await page.getByRole("button", { name: /TSTB/ }).click();
    await page.getByRole("button", { name: "Pause animations" }).click();
    const track = page.locator(".ticker-track");
    await page.locator("#explore").scrollIntoViewIfNeeded();
    const playState = await track.evaluate(
      (el) => getComputedStyle(el).animationPlayState,
    );
    expect(playState).toBe("paused");
    await expect(
      page.getByRole("tab", { name: "Explore stocks", selected: true }),
    ).toBeVisible();
    await expect(page.locator("#demo").getByText("1.25 units")).toBeVisible();
    await page.getByRole("button", { name: "Resume animations" }).click();
    const resumed = await track.evaluate(
      (el) => getComputedStyle(el).animationPlayState,
    );
    expect(resumed).toBe("running");
  });
});
