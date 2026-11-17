import type { Prisma } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { UnprocessableEntityException } from "@/utils/exceptions";

export type AppNotificationDto = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
};

type Cursor = { at: Date; id: string };

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id]), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new UnprocessableEntityException("Invalid cursor", "VALIDATION_FAILED");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new UnprocessableEntityException("Invalid cursor", "VALIDATION_FAILED");
  }
  const at = new Date(parsed[0]);
  if (Number.isNaN(at.getTime())) {
    throw new UnprocessableEntityException("Invalid cursor", "VALIDATION_FAILED");
  }
  return { at, id: parsed[1] };
}

const PAGE_SIZE = 20;

class AppInboxService {
  async list(
    userId: string,
    cursorParam?: string,
  ): Promise<{ items: AppNotificationDto[]; next_cursor: string | null }> {
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    const where: Prisma.NotificationWhereInput = cursor
      ? {
          userId,
          OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }],
        }
      : { userId };
    const rows = await db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    const nextCursor =
      rows.length > PAGE_SIZE && page.length > 0
        ? encodeCursor(page[page.length - 1]!.createdAt, page[page.length - 1]!.id)
        : null;
    return {
      items: page.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        link: row.link,
        read: row.readAt !== null,
        created_at: row.createdAt.toISOString(),
      })),
      next_cursor: nextCursor,
    };
  }

  async markRead(
    userId: string,
    input: { ids?: string[]; all?: boolean },
  ): Promise<{ unread: number }> {
    if (input.all === true) {
      await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: now() },
      });
    } else if (input.ids && input.ids.length > 0) {
      await db.notification.updateMany({
        where: { userId, id: { in: input.ids }, readAt: null },
        data: { readAt: now() },
      });
    }
    return { unread: await this.unreadCount(userId) };
  }

  async unreadCount(userId: string): Promise<number> {
    return db.notification.count({ where: { userId, readAt: null } });
  }
}

export const appInboxService = new AppInboxService();
