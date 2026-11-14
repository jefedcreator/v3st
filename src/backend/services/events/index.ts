import { db } from "@/server/db";
import { now } from "@/backend/clock";
import type { UserEventDto } from "@/types/dto";

class EventService {
  async list(
    userId: string,
    afterSeq: bigint,
    limit = 100,
  ): Promise<UserEventDto[]> {
    const rows = await db.userEvent.findMany({
      where: { userId, seq: { gt: afterSeq } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.seq.toString(),
      type: row.type,
      subject_id: row.subjectId,
      status: row.status,
      created_at: row.createdAt.toISOString(),
    }));
  }

  async sessionExists(sessionToken: string): Promise<boolean> {
    const session = await db.session.findFirst({
      where: { sessionToken, expires: { gt: now() } },
      select: { id: true },
    });
    return session != null;
  }
}

export const eventService = new EventService();
