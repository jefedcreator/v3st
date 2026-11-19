import { expect, it } from "vitest";

import { APP_TABS, isActive, initialsFor, SETTINGS_ITEM, SIDEBAR_EXTRA } from "@/components/app/chrome/nav";
import { notificationTime } from "@/components/app/chrome/notification-time";
import type { AppSessionDto } from "@/types/app";

function signedIn(overrides: {
  display_name?: string | null;
  first_name?: string | null;
  email?: string | null;
}): AppSessionDto {
  const session: AppSessionDto = {
    signed_in: true,
    customer: {
      first_name: overrides.first_name ?? null,
      display_name: overrides.display_name ?? null,
      email: overrides.email ?? null,
    },
    onboarding: { complete: true, next_step: null },
    unread_notifications: 0,
    beta: { test_money: true, notice: "" },
  };
  return session;
}

it("marks the current place without catching neighbours", () => {
  expect(isActive("/stocks/ck1", "/stocks")).toBe(true);
  expect(isActive("/earnings", "/earn")).toBe(false);
  expect(isActive("/home", "/home")).toBe(true);
  expect(APP_TABS.map((t) => t.label)).toEqual(["Home", "Stocks", "Cash", "Earn"]);
  expect(SIDEBAR_EXTRA.map((t) => t.href)).toEqual(["/activity"]);
  expect(SETTINGS_ITEM.href).toBe("/settings");
});

it("builds initials from the session", () => {
  expect(initialsFor(signedIn({ display_name: "Ada Obi" }))).toBe("AO");
  expect(initialsFor(signedIn({ display_name: null, first_name: "Ada" }))).toBe("A");
  expect(initialsFor(signedIn({ display_name: null, first_name: null, email: "tunde@v3st.test" }))).toBe("T");
  expect(initialsFor(null)).toBe("");
});

it("times notifications in Lagos", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  expect(notificationTime("2026-11-20T08:05:00Z", now)).toBe("09:05");
  expect(notificationTime("2026-11-19T08:05:00Z", now)).toBe("Yesterday");
  expect(notificationTime("2026-11-16T08:05:00Z", now)).toBe("Mon 16 Nov");
});
