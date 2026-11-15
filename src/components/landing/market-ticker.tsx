"use client";
import Image from "next/image";
import { useState } from "react";
import { Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
import { useDecorationVisibility, useLandingMotion } from "./landing-motion";
export type TickerRow = {
  id: string;
  title: string;
  detail: string;
  logoSrc?: string;
};
export function MarketTicker({ rows }: { rows: readonly TickerRow[] }) {
  const { ref, visible } = useDecorationVisibility<HTMLDivElement>();
  const { paused, reducedMotion } = useLandingMotion();
  const [localPaused, setLocalPaused] = useState(false);
  const stop = paused || reducedMotion || localPaused || !visible;
  return (
    <div ref={ref} className="market-ticker" data-static={reducedMotion}>
      <div className="ticker-viewport" aria-hidden="true">
        <div
          className="ticker-track"
          style={{
            animationDuration: `${rows.length * 4.5}s`,
            animationPlayState: stop ? "paused" : "running",
          }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="ticker-cycle">
              {rows.map((row) => (
                <div key={row.id} className="ticker-row">
                  <div className="ticker-symbol">
                    {row.logoSrc ? (
                      <Image src={row.logoSrc} alt="" width={36} height={36} />
                    ) : (
                      <span>{row.id}</span>
                    )}
                  </div>
                  <div>
                    <strong>{row.title}</strong>
                    <span>{row.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <ul className={reducedMotion ? "ticker-readable" : "sr-only"}>
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.detail}</span>
          </li>
        ))}
      </ul>
      <div className="ticker-caption">
        <span>Illustrative examples · not live prices</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            localPaused ? "Resume market examples" : "Pause market examples"
          }
          aria-pressed={localPaused}
          onClick={() => setLocalPaused(!localPaused)}
        >
          {localPaused ? (
            <Play aria-hidden="true" />
          ) : (
            <Pause aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}
