import { expect, test, email, PIN } from "./fixtures";

test("simulated sign-in lands on /setup", async ({ page }) => {
  const address = email("signin");
  await page.goto("/signin");
  await page.getByLabel("Email").fill(address);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/setup");
  await expect(page.getByRole("heading", { name: /identity/i })).toBeVisible();
});

test("all four setup steps complete, including Read", async ({ page }) => {
  const address = email("setup");
  await test.step("sign in", async () => {
    await page.goto("/signin");
    await page.getByLabel("Email").fill(address);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/setup");
  });

  // Identity.
  const identity = page.getByRole("radio").first();
  await identity.check();
  await page.getByRole("button", { name: "Continue" }).click();

  // PIN.
  await page.getByLabel("Choose a 4-digit PIN").fill(PIN);
  await page.getByLabel("Enter it again").fill(PIN);
  await page.getByRole("button", { name: "Continue" }).click();

  // Documents: Read opens the dialog, Escape closes it and focus returns.
  const read = page.getByRole("button", { name: "Read" }).first();
  await read.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(read).toBeFocused();

  await page
    .getByRole("checkbox", {
      name: "I've read and accept these documents",
    })
    .check();
  await page.getByRole("button", { name: "Accept and continue" }).click();

  // Bank account.
  await page.getByRole("combobox", { name: "Bank" }).click();
  await page.getByRole("option").first().click();
  await page.getByLabel("Account number").fill("0123456789");
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You're all set")).toBeVisible();
  await page.getByRole("link", { name: "Go to home" }).click();
  await page.waitForURL("**/home");
  await expect(page.getByText("Total value")).toBeVisible();
});
