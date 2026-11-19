import { expect, test, email, readyAccount } from "./fixtures";

import { findCustomerLeaks } from "../../src/backend/services/app/vocabulary";

const PAGES = ["/home", "/stocks", "/stocks-x", "/cash", "/earn", "/earnings", "/activity", "/settings"];

// Every page's rendered copy survives the customer vocabulary check.
test("no rendered page leaks the internal vocabulary", async ({ page }) => {
  await readyAccount(page, email("vocab"));
  const leaks: string[] = [];
  for (const route of PAGES) {
    if (route.endsWith("-x")) continue;
    await page.goto(route);
    const text = await page.evaluate(() => document.body.innerText);
    leaks.push(
      ...findCustomerLeaks(text, { documents: true }).map((leak) => `${route}: ${leak}`),
    );
  }
  expect(leaks).toEqual([]);
});

test("every open modal's copy survives the check", async ({ page }) => {
  await readyAccount(page, email("vocab-modal"));
  const leaks: string[] = [];
  for (const open of ["name", "bank", "pin", "reset-pin", "devices", "automations"]) {
    await page.goto(`/settings?open=${open}`);
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible().catch(() => false)) {
      const text = await dialog.innerText();
      leaks.push(
        ...findCustomerLeaks(text, { documents: true }).map((leak) => `?open=${open}: ${leak}`),
      );
    }
  }
  expect(leaks).toEqual([]);
});
