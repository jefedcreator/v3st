"use client";

import * as React from "react";

import { counterText } from "./format";
import { useLandingMotion } from "./landing-motion";
import { COUNTER, easeOutCubic } from "./motion/contract";

// Server HTML always holds the final value. After hydration the counter counts
// from 0 only when it is not yet visible (below the fold, or inside a hero
// group still at opacity below 0.05), once, when 35% visible, over 800ms with
// easeOutCubic and an optional start delay. Writes textContent directly — no
// React state per frame. Reduced motion keeps the final value.
export function Counter(props: {
  value: number;
  decimals: number;
  prefix: string;
  suffix: string;
  finalText: string;
  startAfterMs?: number;
}): React.JSX.Element {
  const { reducedMotion } = useLandingMotion();
  const ref = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    const group = el.closest<HTMLElement>("[data-hero-group]");
    const groupOpacity = group ? Number(window.getComputedStyle(group).opacity) : 1;
    if (inViewport && groupOpacity >= 0.05) return;

    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        const startAt = performance.now() + (props.startAfterMs ?? 0);
        const step = (now: number) => {
          const t = Math.min(1, Math.max(0, (now - startAt) / COUNTER.durationMs));
          const value = props.value * easeOutCubic(t);
          el.textContent = counterText(
            value,
            props.decimals,
            props.prefix,
            props.suffix,
            t >= 1,
          );
          if (t < 1) raf = window.requestAnimationFrame(step);
        };
        raf = window.requestAnimationFrame(step);
      },
      { threshold: COUNTER.threshold },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [
    reducedMotion,
    props.value,
    props.decimals,
    props.prefix,
    props.suffix,
    props.startAfterMs,
  ]);

  return (
    <span ref={ref} data-figure="">
      {props.finalText}
    </span>
  );
}
