import { randomUUID } from "node:crypto";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { assertBetaRuntime } from "@/backend/integrations/beta-policy";
import { jobService } from "@/backend/services/jobs";
import { scheduler } from "@/backend/services/jobs/schedule";

import { runJob } from "./handlers";

assertBetaRuntime(process.env);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function startWorker(opts: { workerId: string }): {
  stop(): Promise<void>;
} {
  let stopping = false;
  let inFlight: Promise<void>[] = [];

  const loop = async (): Promise<void> => {
    while (!stopping) {
      try {
        await scheduler.tick(now());
        const jobs = await jobService.claim(
          opts.workerId,
          policy.worker.concurrency,
          now(),
        );
        if (jobs.length === 0) {
          await sleep(policy.worker.idlePollMs);
          continue;
        }
        inFlight = jobs.map((job) =>
          runJob(job)
            .then(() => jobService.complete(job, now()))
            .catch((error: unknown) => jobService.fail(job, error, now())),
        );
        await Promise.all(inFlight);
      } catch {
        await sleep(policy.worker.idlePollMs);
      }
    }
  };

  void loop();

  return {
    stop: async () => {
      stopping = true;
      await Promise.all(inFlight);
    },
  };
}

async function main(): Promise<void> {
  const workerId = process.env.WORKER_ID ?? randomUUID();
  const worker = startWorker({ workerId });
  const shutdown = async (): Promise<void> => {
    await worker.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

if (process.env.VITEST !== "true") {
  void main();
}
