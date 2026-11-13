import { expect, it } from "vitest";

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
