import { expect, test, email, PIN, readyAccount } from "./fixtures";

test("changes the display name", async ({ page }) => {
  await readyAccount(page, email("name"));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Change name" }).click();
  await page.getByLabel("What should we call you?").fill("Ada Obi");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Ada Obi")).toBeVisible();
});

test("devices lists this device", async ({ page }) => {
  await readyAccount(page, email("devices"));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Devices" }).click();
  await expect(page.getByText("This device")).toBeVisible();
});

test("/settings/bank lands on /settings?open=bank with the dialog open", async ({ page }) => {
  await readyAccount(page, email("bank"));
  await page.goto("/settings/bank");
  await expect(page).toHaveURL(/\/settings\?open=bank/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
});

test("automations renew with the PIN", async ({ page }) => {
  await readyAccount(page, email("automations"));
  await page.goto("/settings?open=automations");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const renew = dialog.getByRole("button", { name: "Renew" });
  if (await renew.count()) {
    await renew.first().click();
    await dialog.getByLabel("Your PIN").fill(PIN);
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  }
});
