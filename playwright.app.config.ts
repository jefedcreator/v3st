import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/app",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3108",
    browserName: "chromium",
    launchOptions: { executablePath: process.env.LANDING_CHROMIUM_PATH },
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "node scripts/app-e2e.mjs start",
    url: "http://127.0.0.1:3108",
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
