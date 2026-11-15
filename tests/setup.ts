import { afterEach, beforeEach, vi } from "vitest";

vi.stubGlobal("fetch", () =>
  Promise.reject(new Error("Live network access is disabled in tests")),
);

vi.mock("@/backend/observability", () => ({
  logRequest: () => undefined,
  reportError: () => undefined,
}));

// The local testnet (one anvil per run, shared by all test files) keeps
// mutable fixture state; reset it before every test so a scenario or fixture
// from an earlier file cannot leak into a later one.
let chainSnapshot: string | null = null;
beforeEach(async () => {
  try {
    const { testnet } = await import("./helpers/testnet");
    const handle = await testnet();
    chainSnapshot = await handle.snapshot();
    await handle.setO1PartialFillBps(10_000n);
  } catch {
    // The testnet is only deployed for suites that use it; ignore when absent.
  }
});

afterEach(async () => {
  if (chainSnapshot) {
    const { testnet } = await import("./helpers/testnet");
    await (await testnet()).revert(chainSnapshot);
    chainSnapshot = null;
  }
  vi.useRealTimers();
});
