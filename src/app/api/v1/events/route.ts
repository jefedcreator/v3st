import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { eventService } from "@/backend/services/events";
import {
  eventsQuerySchema,
  type EventsQuerySchema,
} from "@/backend/validators/events.validator";
import { SESSION_COOKIE_NAME } from "@/server/auth/constants";

export const dynamic = "force-dynamic";

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 300_000;

export const GET = withMiddleware<null, null, EventsQuerySchema>(
  async (req) => {
    const userId = req.user!.id;
    const resume = req.headers.get("last-event-id") ?? req.query!.after;
    let cursor = 0n;
    if (resume) {
      try {
        const parsed = BigInt(resume);
        if (parsed > 0n) cursor = parsed;
      } catch {
        cursor = 0n;
      }
    }
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            return false;
          }
          return true;
        };
        const startedAt = Date.now();
        let lastHeartbeat = Date.now();
        try {
          while (Date.now() - startedAt < MAX_STREAM_MS) {
            if (!(await eventService.sessionExists(sessionToken))) break;
            const events = await eventService.list(userId, cursor);
            for (const event of events) {
              cursor = BigInt(event.id);
              send(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }
            if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
              send(": heartbeat\n\n");
              lastHeartbeat = Date.now();
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          }
        } catch {
          // stream aborted by the client
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  },
  [authMiddleware, queryValidatorMiddleware(eventsQuerySchema)],
  { bodyMode: "none" },
);
