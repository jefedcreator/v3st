"use client";

import * as React from "react";

import { counterText } from "./format";
import { prefersReducedMotion, useLandingMotion } from "./landing-motion";
import { COUNTER, easeOutCubic } from "./motion/contract";

// Server HTML always holds the final value. After hydration the counter counts
// from 0 only when it is not yet visible (below the fold, or inside a hero
// group still at opacity below 0.05), once, when 35% visible, over 800ms with
// easeOutCubic and an optional start delay. Writes textContent directly — no
// React state per frame. Reduced motion keeps the final value.
//
// Assistive technology only ever reads the final value: the animated digits
// live in an aria-hidden span beside a visually hidden copy of `finalText`.
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
    if (!el || reducedMotion || prefersReducedMotion()) return;
    const render = (value: number, settled: boolean) => {
      el.textContent = counterText(value, props.decimals, props.prefix, props.suffix, settled);
    };

    let raf = 0;
    let observer: IntersectionObserver | null = null;
    // Child effects run before parent effects, so on this pass the hero
    // choreography has not yet faded its groups out. Decide one frame later,
    // once it has.
    let check = window.requestAnimationFrame(() => {
      check = 0;
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
      const group = el.closest<HTMLElement>("[data-hero-group]");
      const groupOpacity = group ? Number(window.getComputedStyle(group).opacity) : 1;
      if (inViewport && groupOpacity >= 0.05) return;

      // Not yet seen: rest at zero now, so the figure never visibly snaps from
      // its final value back to 0 when the count begins. The resting zero uses
      // the settled format ("₦0"); only the count itself widens decimals.
      render(0, true);
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) return;
          observer?.disconnect();
          const startAt = performance.now() + (props.startAfterMs ?? 0);
          const step = (now: number) => {
            const t = Math.min(1, Math.max(0, (now - startAt) / COUNTER.durationMs));
            render(props.value * easeOutCubic(t), t >= 1);
            raf = t < 1 ? window.requestAnimationFrame(step) : 0;
          };
          raf = window.requestAnimationFrame(step);
        },
        { threshold: COUNTER.threshold },
      );
      observer.observe(el);
    });

    return () => {
      window.cancelAnimationFrame(check);
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      // Whatever interrupted the count (reduced motion switched on, unmount),
      // never leave a partial figure behind.
      el.textContent = props.finalText;
    };
  }, [
    reducedMotion,
    props.value,
    props.decimals,
    props.prefix,
    props.suffix,
    props.finalText,
    props.startAfterMs,
  ]);

  return (
    <span className="counter">
      <span className="sr-only">{props.finalText}</span>
      <span ref={ref} data-figure="" aria-hidden="true">
        {props.finalText}
      </span>
    </span>
  );
}
