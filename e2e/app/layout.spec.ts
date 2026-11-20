import type { Page } from "@playwright/test";

import { api, expect, test, email, readyAccount } from "./fixtures";

const PAGES = [
  "/setup",
  "/home",
  "/stocks",
  "/cash",
  "/earn",
  "/earnings",
  "/activity",
  "/settings",
];

async function firstHref(page: Page, list: string, prefix: string): Promise<string> {
  await page.goto(list);
  const href = await page.locator(`a[href^="${prefix}"]`).first().getAttribute("href");
  if (href === null) throw new Error(`no ${prefix} links on ${list}`);
  return href;
}

const LONG_NAME = "A".repeat(40);

test("no page scrolls sideways at 320px", async ({ page }) => {
  const who = email("layout");
  await readyAccount(page, who);
  await api(page, "PATCH", "/profile", { data: { preferred_name: LONG_NAME } });
  await page.setViewportSize({ width: 320, height: 720 });
  const stock = await firstHref(page, "/stocks", "/stocks/");
  const earn = await firstHref(page, "/earn", "/earn/");
  for (const route of [...PAGES, stock, earn]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${route} scrolls sideways (${overflow.scrollWidth} > ${overflow.innerWidth})`,
    ).toBeLessThanOrEqual(overflow.innerWidth);
  }
});

test("every modal traps focus and Escape returns it to the trigger", async ({ page }) => {
  const who = email("focus");
  await readyAccount(page, who);
  await page.setViewportSize({ width: 390, height: 844 });

  // The notifications modal from the bell.
  const bell = page.getByRole("button", { name: /Notifications/ });
  await bell.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Radix hides everything outside an open modal, so check focus from the DOM.
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(bell).toBeFocused();

  // The Add money modal from Home's pill.
  await page.goto("/home");
  const addMoney = page.getByRole("button", { name: "Add money" }).first();
  await addMoney.click();
  const addDialog = page.getByRole("dialog");
  await expect(addDialog).toBeVisible();
  await expect(page.getByLabel("Amount")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(addDialog).toBeHidden();
  await expect(addMoney).toBeFocused();

  // A settings modal from its row.
  await page.goto("/settings");
  const changeName = page.getByRole("button", { name: "Change name" });
  await changeName.click();
  const nameDialog = page.getByRole("dialog");
  await expect(nameDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nameDialog).toBeHidden();
  await expect(changeName).toBeFocused();
});
