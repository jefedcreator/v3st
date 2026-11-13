import { Prisma, type Job } from "@/server/prisma";
import { type DbClient, db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { alertService } from "@/backend/services/alerts";
import { newCuid } from "@/utils";

import { PermanentJobError, RetryableError, backoffMs, type JobInput } from "./types";

const MAX_ATTEMPTS = policy.worker.maxAttempts;

async function raiseDeadAlert(job: Job): Promise<void> {
  await alertService.raise(db, {
    kind: "job.dead",
    severity: "critical",
    dedupeKey: `job.dead:${job.key}`,
    message: `Job ${job.key} is dead`,
    context: { jobKey: job.key, kind: job.kind, subjectId: job.subjectId },
  });
}

class JobService {
  async enqueue(client: DbClient, input: JobInput): Promise<void> {
    const at = now();
    const runAt = input.runAt ?? at;
    await client.$executeRawUnsafe(
      `INSERT INTO "jobs" (id, kind, "subjectId", key, payload, status, "runAt", attempts, "maxAttempts", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6, 0, $7, $8, $8)
       ON CONFLICT (key) DO UPDATE SET
         kind = EXCLUDED.kind,
         "subjectId" = EXCLUDED."subjectId",
         payload = EXCLUDED.payload,
         status = CASE
           WHEN "jobs".status = 'dead' THEN 'dead'
           WHEN "jobs".status = 'done' THEN 'pending'
           ELSE "jobs".status
         END,
         attempts = CASE WHEN "jobs".status = 'done' THEN 0 ELSE "jobs".attempts END,
         "runAt" = CASE
           WHEN "jobs".status = 'dead' THEN "jobs"."runAt"
           WHEN "jobs".status = 'done' THEN EXCLUDED."runAt"
           WHEN "jobs".status = 'pending' THEN LEAST("jobs"."runAt", EXCLUDED."runAt")
           ELSE "jobs"."runAt"
         END,
         "rearmAt" = CASE
           WHEN "jobs".status = 'running' THEN EXCLUDED."runAt"
           ELSE "jobs"."rearmAt"
         END,
         "updatedAt" = EXCLUDED."updatedAt"`,
      newCuid(),
      input.kind,
      input.subjectId,
      `${input.kind}:${input.subjectId}`,
      JSON.stringify(input.payload ?? {}),
      runAt,
      MAX_ATTEMPTS,
      at,
    );
  }

  async claim(workerId: string, limit: number, at: Date): Promise<Job[]> {
    return withTx(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Job[]>(
        `UPDATE "jobs" SET
           status = 'running',
           "lockedBy" = $1,
           "lockedUntil" = $2 + make_interval(secs => $3),
           attempts = attempts + 1,
           "updatedAt" = $2
         WHERE id IN (
           SELECT id FROM "jobs"
           WHERE status IN ('pending', 'running')
             AND "runAt" <= $2
             AND ("lockedUntil" IS NULL OR "lockedUntil" < $2)
           ORDER BY "runAt"
           LIMIT $4
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        workerId,
        at,
        policy.worker.leaseSeconds,
        limit,
      );
      return rows;
    });
  }

  async complete(job: Job, at: Date): Promise<void> {
    const current = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    const data: Prisma.JobUpdateInput = {
      status: "done",
      attempts: 0,
      lockedBy: null,
      lockedUntil: null,
      rearmAt: null,
      lastError: null,
      updatedAt: at,
    };
    if (current.rearmAt) {
      data.status = "pending";
      data.runAt = current.rearmAt;
    }
    await db.job.update({ where: { id: job.id }, data });
  }

  async fail(job: Job, error: unknown, at: Date): Promise<void> {
    const code =
      error instanceof RetryableError
        ? error.code
        : error instanceof PermanentJobError
          ? error.code
          : "INTERNAL";
    const delayMs = error instanceof RetryableError ? error.delayMs : undefined;
    const attempts = job.attempts;
    const dead =
      error instanceof PermanentJobError || attempts >= job.maxAttempts;
    const jitter = Math.floor(Math.random() * 1_000);
    const data: Prisma.JobUpdateInput = dead
      ? {
          status: "dead",
          lastError: code,
          lockedBy: null,
          lockedUntil: null,
          updatedAt: at,
        }
      : {
          status: "pending",
          lastError: code,
          runAt: new Date(
            at.getTime() + (delayMs ?? backoffMs(attempts)) + jitter,
          ),
          lockedBy: null,
          lockedUntil: null,
          updatedAt: at,
        };
    await db.job.update({ where: { id: job.id }, data });
    if (dead) {
      await raiseDeadAlert(job);
    }
  }

  async retryDead(jobId: string): Promise<void> {
    const at = now();
    const data: Prisma.JobUpdateInput = {
      status: "pending",
      attempts: 0,
      runAt: at,
      lastError: null,
      lockedBy: null,
      lockedUntil: null,
      updatedAt: at,
    };
    await db.job.update({ where: { id: jobId }, data });
  }
}

export const jobService = new JobService();
