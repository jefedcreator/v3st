import type { Page } from "@playwright/test";
import { expect, test, email, PIN, readyAccount } from "./fixtures";

async function fundAndGo(page: Page) {
  await readyAccount(page, email("earn"));
  const cashRes = await page.request.fetch("http://127.0.0.1:3108/api/v1/app/cash/deposits", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "http://127.0.0.1:3108" },
    data: JSON.stringify({ amount_kobo: "10000000" }),
  });
  const deposit = ((await cashRes.json()) as { data: { id: string } }).data;
  await page.request.fetch(
    `http://127.0.0.1:3108/api/v1/app/beta/deposits/${deposit.id}/complete`,
    { method: "POST", headers: { Origin: "http://127.0.0.1:3108" } },
  );
}

test("join stays disabled until the risks are ticked, then completes", async ({ page }) => {
  await fundAndGo(page);
  await page.goto("/earn");
  const card = page.locator('a[href^="/earn/"]').first();
  await card.click();

  await page.getByRole("button", { name: "Join" }).click();
  await page.getByLabel("Amount").fill("6000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await page.getByLabel("Your PIN").fill(PIN);
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I've read and accept the Earn risks/i })
    .check();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText(/Joining|Active/i).first()).toBeVisible({ timeout: 60_000 });
});

test("withdraw works once the position is active", async ({ page }) => {
  await fundAndGo(page);
  await page.goto("/earn");
  const card = page.locator('a[href^="/earn/"]').first();
  await card.click();
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByLabel("Amount").fill("6000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page
    .getByRole("checkbox", { name: /I've read and accept the Earn risks/i })
    .check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByText("Active", { exact: true })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /Withdraw/i }).click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/Withdrawing|Withdrawn/i).first()).toBeVisible({ timeout: 90_000 });
});

test("the earnings choice with payout shows on /earnings", async ({ page }) => {
  await fundAndGo(page);
  await page.goto("/earnings");
  await page.getByRole("button", { name: /Choose what happens to your earnings/i }).click();
  await page.getByRole("radio", { name: "Pay me on Fridays" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Paid to your bank on Fridays")).toBeVisible();
});
