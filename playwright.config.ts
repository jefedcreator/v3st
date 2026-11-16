import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "yarn start --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_STAGE: "beta",
      NODE_ENV: "production",
      YELLOWCARD_MODE: "simulated",
      YELLOWCARD_API_KEY: "",
      YELLOWCARD_API_SECRET: "",
      SIMULATED_IDENTITY_SECRET: "playwright-test-only-simulated-identity-secret-0001",
      PAYCREST_SIM_WEBHOOK_SECRET: "playwright-test-only-secret",
      SENTRY_DSN: "",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3107",
      DATABASE_URL: "postgresql://landing:local-only@127.0.0.1:9/landing_unused",
      TESTNET_RPC_URL: "",
      TESTNET_SIGNER_PRIVATE_KEY: "",
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
