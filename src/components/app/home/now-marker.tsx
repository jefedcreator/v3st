"use client";

import { formatLagosTime } from "@/utils/format";
import { useNow } from "@/hooks/app/use-now";

// The Now pill on its hairline, showing Lagos time each minute.
export function NowMarker() {
  const now = useNow(60_000);
  return (
    <div className="relative flex items-center gap-3 py-3 pl-1" aria-hidden="false">
      <span aria-hidden="true" className="bg-signal absolute inset-x-0 left-0 h-px" />
      <span className="border-signal text-gain bg-surface-raised relative rounded-full border px-3 py-1 text-[13px] font-medium">
        Now · <time dateTime={now.toISOString()} suppressHydrationWarning>{formatLagosTime(now.toISOString())}</time>
      </span>
    </div>
  );
}
