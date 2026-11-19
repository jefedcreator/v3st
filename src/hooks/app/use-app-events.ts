"use client";

import * as React from "react";

// Exponential backoff from 1s, capped at 30s.
export function nextBackoffMs(attempt: number): number {
  const ms = 1000 * 2 ** attempt;
  return Math.min(ms, 30_000);
}

// The `changed` frame's areas, or [] when the frame isn't one we know.
export function parseChangedFrame(data: string): string[] {
  try {
    const parsed = JSON.parse(data) as { areas?: unknown };
    if (Array.isArray(parsed.areas)) {
      return parsed.areas.filter((area): area is string => typeof area === "string");
    }
  } catch {
    return [];
  }
  return [];
}

// One EventSource for the app's live updates. Closes in hidden tabs and on
// error, reopens from the last seen id with backoff, and notifies `onAreas`
// with each changed frame's areas.
export function useAppEvents(onAreas: (areas: string[]) => void): void {
  const onAreasRef = React.useRef(onAreas);
  onAreasRef.current = onAreas;

  React.useEffect(() => {
    let source: EventSource | null = null;
    let lastId = "0";
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let openTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function clearTimers() {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (openTimer !== null) {
        clearTimeout(openTimer);
        openTimer = null;
      }
    }

    function close() {
      if (source !== null) {
        source.close();
        source = null;
      }
    }

    function open() {
      if (closed) return;
      close();
      source = new EventSource(`/api/v1/app/events?after=${lastId}`);
      source.addEventListener("changed", (event) => {
        const frame = event as MessageEvent<string>;
        if (frame.lastEventId) lastId = frame.lastEventId;
        const areas = parseChangedFrame(frame.data);
        if (areas.length > 0) onAreasRef.current(areas);
        attempt = 0;
      });
      source.onopen = () => {
        attempt = 0;
      };
      source.onerror = () => {
        close();
        if (closed) return;
        retryTimer = setTimeout(open, nextBackoffMs(attempt));
        attempt += 1;
      };
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        clearTimers();
        close();
      } else {
        open();
      }
    }

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
      close();
    };
  }, []);
}
