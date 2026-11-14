import { execFileSync } from "node:child_process";
import { loadEnv } from "vite";

export default function globalSetup(): void {
  const fileEnv = loadEnv("", process.cwd(), "");
  const testUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is not set; refusing to run tests against the dev database");
  }
  if (testUrl === devUrl) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  }
  const dbName = new URL(testUrl).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL database name must end in "_test" (got "${dbName}")`);
  }
  // Apply pending migrations only. Tests truncate their own data (tests/helpers/db.ts),
  // so no destructive `migrate reset` is needed — Prisma refuses that from agent sessions.
  execFileSync(
    "yarn",
    ["prisma", "migrate", "deploy"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testUrl },
    },
  );
}
