import { eventService } from "@/backend/services/events";
import type { UserEventDto } from "@/types/dto";

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 300_000;

export type StreamMap = (
  event: UserEventDto,
) => { event: string; data: unknown } | null;

// Shared SSE loop: 2 s polling, 15 s heartbeat, 300 s maximum, stopping when the
// session ends. Each event is passed through `map`; null frames are skipped.
export function eventStream(o: {
  userId: string;
  cursor: bigint;
  sessionToken: string;
  signal: AbortSignal;
  map: StreamMap;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string): boolean => {
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          return false;
        }
      };
      const startedAt = Date.now();
      let lastHeartbeat = Date.now();
      let cursor = o.cursor;
      try {
        while (!cancelled && !o.signal.aborted && Date.now() - startedAt < MAX_STREAM_MS) {
          if (!(await eventService.sessionExists(o.sessionToken))) break;
          const events = await eventService.list(o.userId, cursor);
          for (const event of events) {
            cursor = BigInt(event.id);
            const mapped = o.map(event);
            if (!mapped) continue;
            send(`id: ${event.id}\nevent: ${mapped.event}\ndata: ${JSON.stringify(mapped.data)}\n\n`);
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
    cancel() {
      cancelled = true;
    },
  });
}
