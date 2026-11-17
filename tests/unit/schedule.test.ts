import { describe, expect, it } from "vitest";

import {
  dueSchedules,
  lagosDayStart,
  lagosParts,
  lagosWeek,
} from "@/backend/services/jobs/schedule";
import { backoffMs } from "@/backend/services/jobs/types";

it("reads Lagos calendar parts", () => {
  expect(lagosParts(new Date("2026-11-13T07:00:00Z"))).toMatchObject({
    isoDate: "2026-11-13",
    weekday: 5,
    hour: 8,
  });
});

it("computes the Lagos week Monday", () => {
  expect(lagosWeek(new Date("2026-11-13T07:00:00Z"))).toBe("2026-11-09");
  expect(lagosWeek(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16"); // Sunday UTC, Monday Lagos
});

it("computes Lagos day start as a UTC instant", () => {
  expect(lagosDayStart(new Date("2026-11-12T23:30:00Z")).toISOString()).toBe(
    "2026-11-12T23:00:00.000Z",
  );
});

it("emits the scheduled slots that are due", () => {
  expect(dueSchedules(new Date("2026-11-12T21:00:00Z")).map((s) => s.name)).toContain(
    "earnings.harvest",
  ); // Thu 22:00 Lagos
  expect(
    dueSchedules(new Date("2026-11-13T07:00:00Z")).find(
      (s) => s.name === "earnings.payout_batch",
    )?.job.subjectId,
  ).toBe("2026-11-09");
});

it("caps exponential backoff at one hour", () => {
  expect(backoffMs(1)).toBe(5_000);
  expect(backoffMs(20)).toBe(3_600_000);
});

describe("live reference sync schedule", () => {
  it("is scheduled only with Base Sepolia configured, once per 30-second bucket", () => {
    delete process.env.BASE_SEPOLIA_RPC_URL;
    expect(dueSchedules(new Date("2026-11-16T10:00:07Z")).some((s) => s.name === "stocks.reference_sync")).toBe(false);
    process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
    try {
      const slotAt = (iso: string) => dueSchedules(new Date(iso)).find((s) => s.name === "stocks.reference_sync")?.slot;
      // Irregular worker ticks inside one bucket share a slot; the next bucket gets a new one.
      expect(slotAt("2026-11-16T10:00:07Z")).toBeDefined();
      expect(slotAt("2026-11-16T10:00:29Z")).toBe(slotAt("2026-11-16T10:00:07Z"));
      expect(slotAt("2026-11-16T10:00:31Z")).not.toBe(slotAt("2026-11-16T10:00:07Z"));
    } finally {
      delete process.env.BASE_SEPOLIA_RPC_URL;
    }
  });
});
