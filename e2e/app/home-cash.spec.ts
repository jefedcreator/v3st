import { expect, test, email, fundCash, PIN, readyAccount } from "./fixtures";

const address = () => email("homecash");

test("the empty line shows the Now marker and the add money prompt", async ({ page }) => {
  await readyAccount(page, address());
  await expect(page.getByText(/Now ·/)).toBeVisible();
  await expect(page.getByText("Add money to get started.")).toBeVisible();
});

test("add money goes to the transfer receipt and completes in the beta", async ({ page }) => {
  await readyAccount(page, address());
  await page.getByRole("button", { name: "Add money" }).first().click();
  await page.getByLabel("Amount").fill("50000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/activity/dep_*");
  await expect(page.getByText(/Send exactly ₦50,000 to/)).toBeVisible();

  await page.getByRole("button", { name: "Complete this test transfer" }).click();
  // Once paid, the receipt drops the transfer details.
  await expect(page.getByText(/Send exactly/)).toBeHidden({ timeout: 30_000 });

  // The finished item sits below Now, under Earlier.
  await page.goto("/home");
  await expect(page.getByText("Your first transfer will show up here.")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.locator('a[href^="/activity/dep_"]').first()).toBeVisible();
});

test("withdraw goes to its receipt", async ({ page }) => {
  const who = address();
  await readyAccount(page, who);
  await fundCash(page, "5000000");
  await page.goto("/cash");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page.getByLabel("Amount").fill("10000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.waitForURL("**/activity/wd_*");
});

test("the bell opens Notifications and a row lands on its link", async ({ page }) => {
  await readyAccount(page, address());
  await fundCash(page, "5000000");
  await page.goto("/home");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const row = dialog.getByRole("button", { name: /Money added/i }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/cash$/);
});
