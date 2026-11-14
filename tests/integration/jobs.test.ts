import { expect, it } from "vitest";

import { now } from "@/backend/clock";
import { jobService } from "@/backend/services/jobs";
import { scheduler } from "@/backend/services/jobs/schedule";
import { RetryableError } from "@/backend/services/jobs/types";
import { db, withTx } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { setNow } from "../helpers/time";

useTestDatabase();

it("lets only one of two workers claim a due job", async () => {
  setNow("2026-11-13T07:00:00Z");
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "2026-11-13" });
  const [a, b] = await Promise.all([
    jobService.claim("w1", 5, now()),
    jobService.claim("w2", 5, now()),
  ]);
  expect(a.length + b.length).toBe(1);
});

it("reclaims a job whose lease expired", async () => {
  setNow("2026-11-13T07:00:00Z");
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "x" });
  const [first] = await jobService.claim("w1", 1, now());
  setNow("2026-11-13T07:02:01Z");
  const [again] = await jobService.claim("w2", 1, now());
  expect(again?.id).toBe(first?.id);
  expect(again?.attempts).toBe(2);
});

it("re-arms a finished job instead of inserting another row", async () => {
  setNow("2026-11-13T07:00:00Z");
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "rearm" });
  const [job] = await jobService.claim("w1", 1, now());
  await jobService.complete(job!, now());
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "rearm" });
  const rows = await db.job.findMany({ where: { key: "reconcile.run:rearm" } });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.status).toBe("pending");
  expect(rows[0]?.attempts).toBe(0);
});

it("reruns a job re-armed while it was running", async () => {
  setNow("2026-11-13T07:00:00Z");
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "running-rearm" });
  const [job] = await jobService.claim("w1", 1, now());
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "running-rearm" });
  const during = await db.job.findUniqueOrThrow({ where: { key: "reconcile.run:running-rearm" } });
  expect(during.status).toBe("running");
  expect(during.rearmAt).not.toBeNull();
  await jobService.complete(job!, now());
  const after = await db.job.findUniqueOrThrow({ where: { key: "reconcile.run:running-rearm" } });
  expect(after.status).toBe("pending");
});

it("dead-letters after ten attempts and raises one alert", async () => {
  setNow("2026-11-13T07:00:00Z");
  await jobService.enqueue(db, { kind: "reconcile.run", subjectId: "d" });
  let dead = false;
  for (let i = 0; i < 12 && !dead; i++) {
    const claimed = await jobService.claim("w1", 1, now());
    const job = claimed[0];
    if (!job) break;
    await jobService.fail(job, new RetryableError("X"), now());
    const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    if (row.status === "dead") dead = true;
    setNow(new Date(now().getTime() + 3_700_000).toISOString());
  }
  const row = await db.job.findUniqueOrThrow({ where: { key: "reconcile.run:d" } });
  expect(row.status).toBe("dead");
  expect(await db.operationalAlert.count({ where: { kind: "job.dead" } })).toBe(1);
});

it("fires each schedule slot once across concurrent ticks", async () => {
  setNow("2026-11-12T21:00:00Z");
  await Promise.all([scheduler.tick(now()), scheduler.tick(now())]);
  expect(await db.scheduleRun.count({ where: { name: "earnings.harvest" } })).toBe(1);
  expect(await db.job.count({ where: { kind: "earnings.harvest" } })).toBe(1);
});

it("stores runAt exactly when the database session is not in UTC", async () => {
  setNow("2026-11-12T20:01:00Z");
  const runAt = new Date("2026-11-12T20:01:04.000Z");
  const stored = await withTx(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Africa/Lagos'`);
    await jobService.enqueue(tx, { kind: "chain.progress", subjectId: "tz-check", runAt });
    const due = await tx.$queryRawUnsafe<Array<{ due: boolean }>>(
      `SELECT "runAt" <= ($1::timestamptz AT TIME ZONE 'UTC') AS due FROM "jobs" WHERE key = 'chain.progress:tz-check'`,
      new Date("2026-11-12T20:01:04.000Z"),
    );
    return { row: await tx.job.findUniqueOrThrow({ where: { key: "chain.progress:tz-check" } }), due: due[0]?.due };
  });
  expect(stored.row.runAt.toISOString()).toBe("2026-11-12T20:01:04.000Z");
  expect(stored.due).toBe(true);
});
