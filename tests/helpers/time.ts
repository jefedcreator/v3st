import { vi } from "vitest";

export function setNow(iso: string): Date {
  vi.useFakeTimers({ toFake: ["Date"] });
  const date = new Date(iso);
  vi.setSystemTime(date);
  return date;
}
