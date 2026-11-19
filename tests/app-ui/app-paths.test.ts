import { expect, it } from "vitest";
import {
  afterSignInPath,
  parseSettingsOpen,
  safeNext,
  settingsHref,
} from "@/utils/app-paths";

it("keeps next on this site, off auth and API paths", () => {
  expect(safeNext(null)).toBe("/home");
  expect(safeNext("/stocks/ck1")).toBe("/stocks/ck1");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil", "/signin", "/api/v1/app/session", "home"]) {
    expect(safeNext(bad)).toBe("/home");
  }
});

it("sends unfinished setups to /setup", () => {
  expect(afterSignInPath("pin", "/stocks")).toBe("/setup");
  expect(afterSignInPath(null, "/stocks")).toBe("/stocks");
  expect(afterSignInPath(null, null)).toBe("/home");
});

it("parses the settings modal parameter", () => {
  expect(parseSettingsOpen("bank")).toBe("bank");
  expect(parseSettingsOpen(["reset-pin"])).toBe("reset-pin");
  expect(parseSettingsOpen("nope")).toBeNull();
  expect(parseSettingsOpen(undefined)).toBeNull();
  expect(settingsHref("automations")).toBe("/settings?open=automations");
});
