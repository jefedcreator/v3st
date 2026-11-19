import { lagosDayLabel, formatLagosTime } from "@/utils/format";

// A notification's time: the clock for today, then the day in Lagos.
export function notificationTime(createdAt: string, now: Date): string {
  const label = lagosDayLabel(createdAt, now);
  if (label === "Today") return formatLagosTime(createdAt);
  return label;
}
