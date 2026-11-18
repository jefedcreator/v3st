/** Isolated local landing build/server launcher. Never inherits provider credentials. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const childEnv = {};
for (const key of [
  "PATH",
  "HOME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "CI",
  "FORCE_COLOR",
])
  if (process.env[key] !== undefined) childEnv[key] = process.env[key];
// Blank even optional variables before Next loads dotenv; only parse the checked-in template's names.
for (const line of readFileSync(
  new URL("../.env.example", import.meta.url),
  "utf8",
).split("\n")) {
  const match = /^([A-Z_][A-Z_0-9]*)=/.exec(line);
  if (match) childEnv[match[1]] = "";
}
Object.assign(childEnv, {
  NODE_ENV: "production",
  APP_STAGE: "beta",
  YELLOWCARD_MODE: "simulated",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3107",
  DATABASE_URL: "postgresql://landing:local-only@127.0.0.1:9/landing_unused",
  SIMULATED_IDENTITY_SECRET: "landing-only-simulated-identity-secret-0001",
  PAYCREST_SIM_WEBHOOK_SECRET: "landing-only-paycrest-secret-0001",
  RATE_LIMIT_SECRET: "landing-only-rate-limit-secret-0000000001",
  SENTRY_DSN: "",
  TESTNET_CHAIN_ID: "31337",
  NEXT_TELEMETRY_DISABLED: "1",
});
const mode = process.argv[2];
if (mode !== "build" && mode !== "start")
  throw new Error("Choose build or start");
const args = [require.resolve("next/dist/bin/next"), mode];
if (mode === "start") args.push("--hostname", "127.0.0.1", "--port", "3107");
const executable = mode === "start" ? "yarn" : process.execPath;
const commandArgs = mode === "start" ? args.slice(1) : args;
const child = spawn(executable, commandArgs, {
  stdio: "inherit",
  env: childEnv,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
