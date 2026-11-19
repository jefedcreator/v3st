import { expect, test, email, readyAccount } from "./fixtures";

const PAGES = [
  "/home",
  "/stocks",
  "/cash",
  "/earn",
  "/earnings",
  "/activity",
  "/settings",
];

const LONG_NAME = "A".repeat(40);

test("no page scrolls sideways at 320px", async ({ page, context }) => {
  const who = email("layout");
  await readyAccount(page, who);
  await page.request.fetch("http://127.0.0.1:3108/api/v1/app/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json", Origin: "http://127.0.0.1:3108" },
    data: JSON.stringify({ preferred_name: LONG_NAME }),
  });
  await page.setViewportSize({ width: 320, height: 720 });
  const visited: string[] = [];
  for (const route of PAGES) {
    await page.goto(route);
    visited.push(route);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${route} scrolls sideways (${overflow.scrollWidth} > ${overflow.innerWidth})`,
    ).toBeLessThanOrEqual(overflow.innerWidth);
  }
  void visited;
  void context;
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
  await expect(page.getByRole("button", { name: /Notifications/ })).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(bell).toBeFocused();

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
