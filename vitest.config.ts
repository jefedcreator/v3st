import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode === "test" ? "test" : mode, process.cwd(), "");
  return {
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
    },
    test: {
      environment: "node",
      testTimeout: 30_000,
      hookTimeout: 30_000,
      fileParallelism: false,
      include: ["tests/**/*.test.ts"],
      setupFiles: ["tests/setup.ts"],
      globalSetup: ["tests/global-setup.ts"],
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? loaded.TEST_DATABASE_URL ?? "",
        APP_STAGE: "beta",
        YELLOWCARD_MODE: "simulated",
        SIMULATED_IDENTITY_SECRET: "vitest-simulated-identity-secret-0001",
        PAYCREST_SIM_WEBHOOK_SECRET: "paycrest-test-secret",
        RATE_LIMIT_SECRET: "vitest-rate-limit-secret-00000000000000001",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      },
    },
  };
});
