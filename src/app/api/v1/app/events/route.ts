import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { customerAreasFor } from "@/backend/services/app/events";
import { eventStream } from "@/backend/services/events/stream";
import {
  eventsQuerySchema,
  type EventsQuerySchema,
} from "@/backend/validators/events.validator";
import { SESSION_COOKIE_NAME } from "@/server/auth/constants";

export const dynamic = "force-dynamic";

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
    const sessionToken =
      req.cookies.get(SESSION_COOKIE_NAME)?.value ??
      req.headers.get("authorization")?.slice(7) ??
      "";
    const stream = eventStream({
      userId,
      cursor,
      sessionToken,
      signal: req.signal,
      map: (event) => {
        const areas = customerAreasFor(event.type);
        if (areas.length === 0) return null;
        return { event: "changed", data: { areas } };
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
  { audience: "customer", bodyMode: "none" },
);
