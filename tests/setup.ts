import { vi } from "vitest";

vi.stubGlobal("fetch", () =>
  Promise.reject(new Error("Live network access is disabled in tests")),
);

vi.mock("@/backend/observability", () => ({
  logRequest: () => undefined,
  reportError: () => undefined,
}));
