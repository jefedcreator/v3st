import { lagosDayLabel } from "@/utils/format";
import type { AppActivityItemDto, AppProgress } from "@/types/app";

export function groupByLagosDay(
  items: AppActivityItemDto[],
  now: Date,
): { label: string; items: AppActivityItemDto[] }[] {
  const groups: { label: string; items: AppActivityItemDto[] }[] = [];
  for (const item of items) {
    const label = lagosDayLabel(item.occurred_at, now);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

// An unpaid bank transfer receipt: the deposit is still waiting.
export function isUnpaidTransfer(item: { id: string; status: AppProgress }): boolean {
  return item.id.startsWith("dep_") && item.status === "waiting";
}

export function depositIdOf(activityId: string): string {
  return activityId.slice("dep_".length);
}

export function progressLabel(status: AppProgress): string | null {
  switch (status) {
    case "completed":
      return null;
    case "failed":
      return "Didn't go through";
    case "action_needed":
      return "Needs you";
    case "waiting":
      return "Waiting";
    case "processing":
      return "Processing";
    case "cancelled":
      return "Cancelled";
  }
}
