"use client";

import { formatLagosTime } from "@/utils/format";
import { useNow } from "@/hooks/app/use-now";

// The Now pill on its signal hairline, in Lagos time, refreshed each minute.
// It spans the gutter so it sits over the spine where dashed turns solid.
export function NowMarker() {
  const now = useNow(60_000);
  return (
    <div className="relative flex h-10 items-center">
      <span aria-hidden="true" className="bg-signal absolute inset-x-0 top-1/2 h-px" />
      <span className="border-signal bg-surface-raised text-gain relative rounded-full border px-2.5 py-0.5 text-[13px] font-semibold tabular-nums">
        Now ·{" "}
        <time dateTime={now.toISOString()} suppressHydrationWarning>
          {formatLagosTime(now.toISOString())}
        </time>
      </span>
    </div>
  );
}
