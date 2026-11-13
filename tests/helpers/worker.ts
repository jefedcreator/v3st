import { now } from "@/backend/clock";
import { jobService } from "@/backend/services/jobs";
import { scheduler } from "@/backend/services/jobs/schedule";
import { runJob } from "@/backend/workers/handlers";
import { db } from "@/server/db";

import { setNow } from "./time";

export async function drainJobs(opts?: { maxSteps?: number }): Promise<{ ran: number }> {
  const maxSteps = opts?.maxSteps ?? 200;
  let ran = 0;
  for (let step = 0; step < maxSteps; step++) {
    const at = now();
    await scheduler.tick(at);
    const due = await jobService.claim("test-worker", 100, at);
    if (due.length === 0) {
      const next = await db.job.findFirst({
        where: { status: "pending" },
        orderBy: { runAt: "asc" },
      });
      if (!next) {
        return { ran };
      }
      setNow(next.runAt.toISOString());
      continue;
    }
    for (const job of due) {
      ran += 1;
      try {
        await runJob(job);
        await jobService.complete(job, now());
      } catch (error) {
        await jobService.fail(job, error, now());
      }
    }
  }
  return { ran };
}
