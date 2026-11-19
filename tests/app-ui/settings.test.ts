import { expect, it } from "vitest";

import {
  PREFERRED_NAME_SOURCE,
  automationLine,
  identityLine,
  isValidPreferredName,
} from "@/components/app/settings/settings";
import { PREFERRED_NAME_PATTERN } from "@/backend/services/app/profile";
import type { AppAutomationDto, AppProfileDto } from "@/types/app";

function profile(o: { identity: { verified: boolean; level: AppProfileDto["identity"]["level"] } }): AppProfileDto {
  return {
    first_name: null,
    preferred_name: null,
    email: null,
    identity: o.identity,
    bank_account: null,
  };
}

function auto(o: Partial<AppAutomationDto>): AppAutomationDto {
  const base: AppAutomationDto = {
    id: "auth1",
    title: "Keep earning",
    detail: "",
    active: true,
    expires_at: "2026-12-03T10:00:00Z",
    needs_renewal: false,
  };
  return { ...base, ...o };
}

it("describes identity and automations", () => {
  expect(identityLine(profile({ identity: { verified: true, level: "standard" } }))).toBe("Verified");
  expect(identityLine(profile({ identity: { verified: true, level: "higher" } }))).toBe(
    "Verified · higher limits",
  );
  expect(identityLine(profile({ identity: { verified: false, level: null } }))).toBe(
    "Not verified yet",
  );
  expect(
    automationLine(auto({ active: true, needs_renewal: true, expires_at: "2026-12-03T10:00:00Z" })),
  ).toBe("Renew by Thu 3 Dec");
  expect(
    automationLine(auto({ active: true, needs_renewal: false, expires_at: "2026-12-03T10:00:00Z" })),
  ).toBe("On until Thu 3 Dec");
  expect(automationLine(auto({ active: false }))).toBe("Off");
});

it("validates preferred names exactly as the API does", () => {
  expect(PREFERRED_NAME_SOURCE).toBe(PREFERRED_NAME_PATTERN.source);
  expect(isValidPreferredName("Ada")).toBe(true);
  expect(isValidPreferredName("4da")).toBe(false);
});
