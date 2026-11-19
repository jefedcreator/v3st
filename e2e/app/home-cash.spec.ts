import { expect, test, email, PIN, readyAccount } from "./fixtures";

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
  await expect(page.getByText(/Money added/i)).toBeVisible({ timeout: 30_000 });

  await page.goto("/home");
  await expect(page.getByText("Earlier")).toBeVisible();
  await expect(page.getByText(/Money added/i).first()).toBeVisible();
});

test("withdraw goes to its receipt", async ({ page }) => {
  const who = address();
  await readyAccount(page, who);
  // Seed cash through the deposit API + beta completion through page.request.
  const cashRes = await page.request.fetch("http://127.0.0.1:3108/api/v1/app/cash/deposits", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "http://127.0.0.1:3108" },
    data: JSON.stringify({ amount_kobo: "5000000" }),
  });
  const deposit = ((await cashRes.json()) as { data: { id: string } }).data;
  await page.request.fetch(
    `http://127.0.0.1:3108/api/v1/app/beta/deposits/${deposit.id}/complete`,
    { method: "POST", headers: { Origin: "http://127.0.0.1:3108" } },
  );
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
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Money added/i).first()).toBeVisible({ timeout: 30_000 });
  await dialog
    .getByRole("button", {
      name: /Money added/i,
    })
    .first()
    .click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/activity\/dep_/);
});
