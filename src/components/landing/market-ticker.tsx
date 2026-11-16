"use client";

import { useState } from "react";
import { Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/utils/cn";
import { TICKER_SECONDS_PER_ROW } from "./motion-contract";
import { useLandingMotion } from "./landing-motion";

export type TickerRow = {
  id: string;
  title: string;
  detail: string;
  logoSrc?: string;
};

export function MarketTicker({ rows }: { rows: readonly TickerRow[] }) {
  const { paused, reducedMotion } = useLandingMotion();
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const stopped = paused || reducedMotion || userPaused || hoverPaused;
  const durationSeconds = rows.length * TICKER_SECONDS_PER_ROW;

  const rowList = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-4 border-b border-rule px-2 py-4"
        >
          {row.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.logoSrc}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0"
            />
          ) : (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sage text-[10px] font-bold text-primary">
              {row.title.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {row.title}
            </span>
            <span className="block truncate text-xs text-ink-muted">
              {row.detail}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={cn("ticker-root", stopped && "ticker-paused")}>
      <div
        className="ticker-viewport h-[22rem] overflow-hidden sm:h-[26rem]"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
        onFocus={() => setHoverPaused(true)}
        onBlur={() => setHoverPaused(false)}
        style={
          reducedMotion
            ? undefined
            : {
                maskImage:
                  "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
              }
        }
      >
        {reducedMotion ? (
          rowList(false)
        ) : (
          <div
            className="ticker-track"
            style={{ "--ticker-duration": `${durationSeconds}s` } as React.CSSProperties}
          >
            {rowList(false)}
            {rowList(true)}
          </div>
        )}
      </div>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.id}>
            {row.title} — {row.detail}
          </li>
        ))}
      </ul>
      <button
        type="button"
        aria-pressed={userPaused}
        onClick={() => setUserPaused(!userPaused)}
        className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-rule bg-surface px-3 text-xs font-medium text-ink transition-colors hover:bg-sage focus-visible:ring-[3px] focus-visible:ring-ring/40 focus:outline-none"
      >
        {userPaused ? (
          <Play className="size-3.5" weight="fill" />
        ) : (
          <Pause className="size-3.5" weight="fill" />
        )}
        {userPaused ? "Resume ticker" : "Pause ticker"}
      </button>
    </div>
  );
}
