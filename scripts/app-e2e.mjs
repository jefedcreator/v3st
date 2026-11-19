/**
 * Isolated local customer-app e2e stack. Never inherits provider credentials.
 *
 * prepare: refuse unless the test database ends in _test and the RPC is
 *   loopback chain 31337, then migrate and seed.
 * start: build, then serve the app on 127.0.0.1:3108 with the worker and a
 *   reference-refresher loop for the seeded stock.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const PORT = 3108;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const childEnv = {};
for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "CI", "FORCE_COLOR"])
  if (process.env[key] !== undefined) childEnv[key] = process.env[key];

// Blank even optional variables before Next loads dotenv.
for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
  const match = /^([A-Z_][A-Z_0-9]*)=/.exec(line);
  if (match) childEnv[match[1]] = "";
}

Object.assign(childEnv, {
  NODE_ENV: "production",
  APP_STAGE: "beta",
  PRIVY_MODE: "simulated",
  APP_CUSTOMER_CHAIN: "testnet",
  NEXT_PUBLIC_APP_URL: ORIGIN,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  SIMULATED_IDENTITY_SECRET: "vitest-simulated-identity-secret-0001",
  PAYCREST_SIM_WEBHOOK_SECRET: "paycrest-test-secret",
  RATE_LIMIT_SECRET: "vitest-rate-limit-secret-00000000000000001",
  TESTNET_CHAIN_ID: "31337",
  NEXT_TELEMETRY_DISABLED: "1",
});

function assertSafeTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required for app e2e");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to run app e2e against "${name}"; the database must end in _test`);
  }
  childEnv.DATABASE_URL = url;
}

function assertLoopbackTestnet() {
  const rpc = process.env.TESTNET_RPC_URL ?? childEnv.TESTNET_RPC_URL ?? "";
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(rpc) && !/^http:\/\/localhost:\d+$/.test(rpc)) {
    throw new Error("app e2e needs TESTNET_RPC_URL on loopback (chain 31337)");
  }
}

const mode = process.argv[2];

if (mode === "prepare") {
  assertSafeTestDatabase();
  assertLoopbackTestnet();
  const migrated = spawnSync("yarn", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: childEnv,
  });
  if (migrated.status !== 0) process.exit(migrated.status ?? 1);
  const seed = spawnSync(process.execPath, [
    require.resolve("tsx/dist/cli.mts"),
    "scripts/app-e2e-seed.ts",
  ], { stdio: "inherit", env: childEnv });
  process.exit(seed.status ?? 1);
}

if (mode === "start") {
  if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for app e2e");
  assertSafeTestDatabase();
  const children = [];
  const build = spawnSync("yarn", ["build"], { stdio: "inherit", env: childEnv });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(PORT)],
    { stdio: "inherit", env: childEnv },
  );
  children.push(server);
  const worker = spawn("yarn", ["worker"], { stdio: "inherit", env: childEnv, shell: true });
  children.push(worker);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      for (const child of children) child.kill(signal);
      process.exit(0);
    });
  }
  const any = children.map(
    (child) =>
      new Promise((resolve) => {
        child.on("exit", (code) => resolve(code ?? 1));
      }),
  );
  void Promise.any(any).then((code) => process.exit(code === 0 ? 1 : Number(code) || 1));
  // Everything runs forever; keep the process alive.
  await new Promise(() => {});
}

if (mode !== "prepare" && mode !== "start") {
  throw new Error("Choose prepare or start");
}
