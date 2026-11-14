import { type Prisma } from "@/server/prisma";
import { db, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import type { UserEventDto } from "@/types/dto";

class EventService {
  // Records one committed domain change for SSE/polling; call inside the
  // transaction that produced the change so the event is never ahead of state.
  async emit(
    client: Tx | typeof db,
    userId: string,
    type: string,
    subjectId: string,
    status: string | null = null,
  ): Promise<void> {
    const data: Prisma.UserEventCreateInput = {
      userId,
      type,
      subjectId,
      status,
      createdAt: now(),
    };
    await client.userEvent.create({ data });
  }

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
