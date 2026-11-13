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
  execFileSync(
    "yarn",
    ["prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testUrl },
    },
  );
}
