"use client";

import * as React from "react";

import { useLandingMotion } from "./landing-motion";
import { tickerDurationSeconds } from "./motion/contract";

// The masked ticker viewport. Renders the rows once, then an aria-hidden and
// inert duplicate, inside a marquee that moves translateY(0 -> -50%) over
// --marquee-duration seconds. Pauses on hover, focus-within, when the page
// motion is paused, and when offscreen or hidden (data-offscreen). Under
// reduced motion there is no animation and no duplicate.
export function PriceTicker(props: {
  children: React.ReactNode;
  rowCount: number;
}): React.JSX.Element {
  const { reducedMotion } = useLandingMotion();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const setOffscreen = (value: boolean) => {
      viewport.dataset.offscreen = String(value);
    };
    const observer = new IntersectionObserver(
      (entries) => setOffscreen(!entries[0]?.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(viewport);
    const onVisibility = () => setOffscreen(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const style = {
    "--marquee-duration": `${tickerDurationSeconds(props.rowCount)}s`,
  } as React.CSSProperties;

  return (
    <div ref={viewportRef} className="ticker-viewport" data-offscreen="false" style={style}>
      <div className="ticker-marquee">
        <ul aria-label="Beta prices" className="ticker-list">
          {props.children}
        </ul>
        {reducedMotion ? null : (
          <ul aria-hidden="true" inert className="ticker-list ticker-duplicate">
            {props.children}
          </ul>
        )}
      </div>
    </div>
  );
}
