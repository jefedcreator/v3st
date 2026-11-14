import type { ProviderId } from "@/server/prisma";
import { db } from "@/server/db";

const FAILURE_THRESHOLD = 5;
const OPEN_MS = 300_000;

class ProviderHealthService {
  async record(provider: ProviderId, ok: boolean, at: Date): Promise<void> {
    const existing = await db.providerHealth.findUnique({ where: { provider } });
    if (ok) {
      await db.providerHealth.upsert({
        where: { provider },
        create: { provider, consecutiveFailures: 0, lastSuccessAt: at, openUntil: null },
        update: { consecutiveFailures: 0, lastSuccessAt: at, openUntil: null },
      });
      return;
    }
    const failures = (existing?.consecutiveFailures ?? 0) + 1;
    const openUntil =
      failures >= FAILURE_THRESHOLD
        ? new Date(at.getTime() + OPEN_MS)
        : (existing?.openUntil ?? null);
    await db.providerHealth.upsert({
      where: { provider },
      create: { provider, consecutiveFailures: failures, lastFailureAt: at, openUntil },
      update: { consecutiveFailures: failures, lastFailureAt: at, openUntil },
    });
  }

  async isOpen(provider: ProviderId, at: Date): Promise<boolean> {
    const row = await db.providerHealth.findUnique({ where: { provider } });
    return row?.openUntil != null && at < row.openUntil;
  }
}

export const providerHealth = new ProviderHealthService();
