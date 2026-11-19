import type { Page } from "@playwright/test";
import { expect, test, email, PIN, readyAccount } from "./fixtures";

async function fundAndGo(page: Page) {
  await readyAccount(page, email("trade"));
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

async function stock(page: Page): Promise<string> {
  await page.goto("/stocks");
  const first = page.locator('a[href^="/stocks/"]').first();
  const href = await first.getAttribute("href");
  if (href === null) throw new Error("no stock rows on /stocks");
  return href;
}

test("buy now with cash confirms with the PIN and completes", async ({ page }) => {
  await fundAndGo(page);
  const href = await stock(page);
  await page.goto(href);
  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByLabel("Amount").fill("2000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.waitForURL("**/orders/*");
  await expect(page.getByText("Done", { exact: true })).toBeVisible({ timeout: 60_000 });
});

test("pay by transfer shows the transfer card and the beta completion", async ({ page }) => {
  await fundAndGo(page);
  const href = await stock(page);
  await page.goto(href);
  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByLabel("Amount").fill("2000");
  await page.getByRole("radio", { name: "Bank transfer" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.waitForURL("**/orders/*");
  await expect(page.getByText(/Send exactly/i)).toBeVisible();
  await page.getByRole("button", { name: "Complete this test transfer" }).click();
  await expect(page.getByText("Done", { exact: true })).toBeVisible({ timeout: 60_000 });
});

test("a wrong PIN shows its message and clears the input", async ({ page }) => {
  await fundAndGo(page);
  const href = await stock(page);
  await page.goto(href);
  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByLabel("Amount").fill("2000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  await page.getByLabel("Your PIN").fill("0000");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/That PIN isn't right/i)).toBeVisible();
  await expect(page.getByLabel("Your PIN")).toBeEmpty();
});

test("double confirm places one order", async ({ page }) => {
  await fundAndGo(page);
  const href = await stock(page);
  await page.goto(href);
  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByLabel("Amount").fill("2000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await page.getByLabel("Your PIN").fill(PIN);
  await confirm.click();
  const secondClick = confirm.click({ force: true, noWaitAfter: true });
  await secondClick.catch(() => undefined);
  await page.waitForURL("**/orders/*");
  await page.goto("/activity");
  await expect(page.getByRole("link", { name: /Buy / })).toHaveCount(1);
});
