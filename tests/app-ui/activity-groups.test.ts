import { expect, it } from "vitest";

import {
  depositIdOf,
  groupByLagosDay,
  isUnpaidTransfer,
  progressLabel,
} from "@/components/app/activity/activity-groups";
import type { AppActivityItemDto } from "@/types/app";

function item(id: string, occurredAt: string): AppActivityItemDto {
  return {
    id,
    kind: "add_money",
    title: id,
    subtitle: "",
    amount_kobo: null,
    direction: "in",
    status: "completed",
    occurred_at: occurredAt,
    reference: "ref",
  };
}

it("groups by Lagos day in feed order", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const groups = groupByLagosDay(
    [
      item("a", "2026-11-20T08:00:00Z"),
      item("b", "2026-11-19T23:30:00Z"),
      item("c", "2026-11-19T09:00:00Z"),
    ],
    now,
  );
  expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
    ["Today", ["a", "b"]],
    ["Yesterday", ["c"]],
  ]);
});

it("recognises unpaid transfers and labels progress", () => {
  expect(isUnpaidTransfer({ id: "dep_ck1", status: "waiting" })).toBe(true);
  expect(isUnpaidTransfer({ id: "dep_ck1", status: "completed" })).toBe(false);
  expect(isUnpaidTransfer({ id: "wd_ck1", status: "waiting" })).toBe(false);
  expect(depositIdOf("dep_ck1")).toBe("ck1");
  expect(progressLabel("completed")).toBeNull();
  expect(progressLabel("failed")).toBe("Didn't go through");
  expect(progressLabel("action_needed")).toBe("Needs you");
  expect(progressLabel("waiting")).toBe("Waiting");
  expect(progressLabel("processing")).toBe("Processing");
  expect(progressLabel("cancelled")).toBe("Cancelled");
});
