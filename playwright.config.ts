import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3107",
    browserName: "chromium",
    launchOptions: { executablePath: process.env.LANDING_CHROMIUM_PATH },
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "node scripts/landing-beta.mjs start",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
