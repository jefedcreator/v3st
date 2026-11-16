import { db } from "@/server/db";
import { policy } from "@/backend/config/policy";

import { jobService } from "./index";
import type { JobInput } from "./types";

const LAGOS_OFFSET_MS = 3_600_000; // Africa/Lagos is UTC+1 year-round (no DST)

const WEEKDAYS: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export function lagosParts(d: Date): {
  isoDate: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  minute: number;
} {
  const parts = formatter.formatToParts(d);
  const get = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    return part?.value ?? "";
  };
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = WEEKDAYS[get("weekday")] ?? 1;
  return {
    isoDate: `${year}-${month}-${day}`,
    weekday,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

const pad = (n: number): string => n.toString().padStart(2, "0");

export function lagosDayStart(d: Date): Date {
  const { isoDate } = lagosParts(d);
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day, 0, 0, 0) - LAGOS_OFFSET_MS);
}

export function lagosMonthStart(d: Date): Date {
  const { isoDate } = lagosParts(d);
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1, 0, 0, 0) - LAGOS_OFFSET_MS);
}

export function lagosWeek(d: Date): string {
  const { weekday } = lagosParts(d);
  const monday = new Date(lagosDayStart(d).getTime() - (weekday - 1) * 86_400_000);
  return lagosParts(monday).isoDate;
}

export type DueSchedule = { name: string; slot: string; job: JobInput };

export function dueSchedules(at: Date): DueSchedule[] {
  const parts = lagosParts(at);
  const week = lagosWeek(at);
  const out: DueSchedule[] = [];

  out.push({
    name: "poll.open_work",
    slot: `${parts.isoDate}T${pad(parts.hour)}:${pad(parts.minute)}`,
    job: { kind: "poll.open_work", subjectId: "global" },
  });

  // Live reference sync every referenceSyncSeconds, only when Base Sepolia is
  // configured. The worker ticks at irregular instants, so the slot is the
  // 30-second bucket containing `at` (deduplicated by schedule_runs), not an exact
  // second that a tick could skip.
  if (process.env.BASE_SEPOLIA_RPC_URL) {
    const bucket = Math.floor(at.getTime() / 1000 / policy.schedule.referenceSyncSeconds);
    out.push({
      name: "stocks.reference_sync",
      slot: `bucket-${bucket}`,
      job: { kind: "stocks.reference_sync", subjectId: "global" },
    });
  }

  if (parts.minute === policy.schedule.rebalanceMinuteOfHour) {
    out.push({
      name: "treasury.rebalance",
      slot: `${parts.isoDate}T${pad(parts.hour)}:30`,
      job: { kind: "treasury.rebalance", subjectId: "global" },
    });
  }

  if (parts.hour === policy.schedule.reconcileHour && parts.minute === 0) {
    out.push({
      name: "reconcile.run",
      slot: `${parts.isoDate}T02:00`,
      job: { kind: "reconcile.run", subjectId: parts.isoDate },
    });
  }

  const weekStart = lagosDayStart(new Date(at.getTime() - (parts.weekday - 1) * 86_400_000));
  const dayMs = 86_400_000;

  const harvestAt = new Date(
    weekStart.getTime() +
      (policy.schedule.harvest.weekday - 1) * dayMs +
      policy.schedule.harvest.hour * 3_600_000,
  );
  if (at >= harvestAt) {
    out.push({
      name: "earnings.harvest",
      slot: `${week}T${pad(policy.schedule.harvest.hour)}:00`,
      job: { kind: "earnings.harvest", subjectId: week },
    });
  }

  const precheckAt = new Date(
    weekStart.getTime() +
      (policy.schedule.floatPrecheck.weekday - 1) * dayMs +
      policy.schedule.floatPrecheck.hour * 3_600_000,
  );
  if (at >= precheckAt) {
    out.push({
      name: "earnings.float_precheck",
      slot: `${week}T${pad(policy.schedule.floatPrecheck.hour)}:00`,
      job: { kind: "earnings.float_precheck", subjectId: week },
    });
  }

  const friday = new Date(
    weekStart.getTime() + (policy.schedule.payouts.weekday - 1) * dayMs,
  );
  const fridayIso = lagosParts(friday).isoDate;
  const payoutEnd = new Date(
    friday.getTime() + policy.schedule.payouts.endHour * 3_600_000,
  );
  if (parts.weekday === policy.schedule.payouts.weekday && parts.hour >= policy.schedule.payouts.startHour && parts.hour <= policy.schedule.payouts.endHour) {
    out.push({
      name: "earnings.payout_batch",
      slot: `${parts.isoDate}T${pad(parts.hour)}:00`,
      job: { kind: "earnings.payout_batch", subjectId: week },
    });
  } else if (at > payoutEnd) {
    out.push({
      name: "earnings.payout_batch",
      slot: `${fridayIso}T${pad(policy.schedule.payouts.endHour)}:00`,
      job: { kind: "earnings.payout_batch", subjectId: week },
    });
  }

  return out;
}

export const scheduler = {
  async tick(at: Date): Promise<number> {
    const due = dueSchedules(at);
    let enqueued = 0;
    for (const s of due) {
      const inserted = await db.$queryRaw<Array<{ name: string; slot: string }>>`
        INSERT INTO "schedule_runs" (name, slot)
        VALUES (${s.name}, ${s.slot})
        ON CONFLICT (name, slot) DO NOTHING
        RETURNING name, slot
      `;
      if (inserted.length > 0) {
        await jobService.enqueue(db, {
          kind: s.job.kind,
          subjectId: s.job.subjectId,
          payload: { schedule: s.name, slot: s.slot },
        });
        enqueued += 1;
      }
    }
    return enqueued;
  },
};
