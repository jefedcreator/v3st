"use client";

import * as React from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  ArrowUDownLeft,
  Bank,
  CalendarCheck,
  ChartLineUp,
  Plant,
} from "@phosphor-icons/react/dist/ssr";

import { useLandingMotion } from "./landing-motion";
import { DIAGRAM, parallaxOffset } from "./motion/contract";

export function nextStage(current: number, total: number): number {
  return (current + 1) % total;
}

const STAGE_ICONS: Record<string, PhosphorIcon> = {
  Bank,
  ChartLineUp,
  Plant,
  CalendarCheck,
  ArrowUDownLeft,
};

// The decorative diagram beside the ordered list: one floating panel and one
// caption per stage, entrance once at 20% visible, autoplay from 1080ms
// every 3600ms while visible and not engaged, 120ms hover intent and 140ms
// leave grace. The whole thing is aria-hidden; the ordered list is the content.
// Paused, hidden, offscreen or reduced motion stops autoplay; it resumes when
// the diagram is visible again. Server HTML shows the panels: they are only
// hidden for the entrance once JavaScript has hydrated (data-entered="false").
export function JourneyDiagram(props: {
  stages: readonly { title: string; caption: string; icon: string }[];
}): React.JSX.Element {
  const { paused, reducedMotion } = useLandingMotion();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // null until hydrated, so the server HTML carries no entrance state.
  const [entered, setEntered] = React.useState<boolean | null>(null);
  const [active, setActive] = React.useState(0);
  const enteredRef = React.useRef(false);
  const visibleRef = React.useRef(false);
  const engagedRef = React.useRef(false);
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;
  const reducedMotionRef = React.useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const autoplayRef = React.useRef<number | undefined>(undefined);
  const delayRef = React.useRef<number | undefined>(undefined);
  const hoverRef = React.useRef<number | undefined>(undefined);
  const leaveRef = React.useRef<number | undefined>(undefined);
  const total = props.stages.length;

  const stopAutoplay = React.useCallback(() => {
    window.clearTimeout(delayRef.current);
    window.clearInterval(autoplayRef.current);
    delayRef.current = undefined;
    autoplayRef.current = undefined;
  }, []);

  // Starts (or restarts) autoplay when every condition allows it: entered,
  // visible, document shown, not paused and motion not reduced.
  const startAutoplay = React.useCallback(() => {
    if (
      autoplayRef.current !== undefined ||
      delayRef.current !== undefined ||
      !enteredRef.current ||
      !visibleRef.current ||
      document.hidden ||
      pausedRef.current ||
      reducedMotionRef.current
    ) {
      return;
    }
    delayRef.current = window.setTimeout(() => {
      delayRef.current = undefined;
      autoplayRef.current = window.setInterval(() => {
        if (visibleRef.current && !engagedRef.current) {
          setActive((current) => nextStage(current, total));
        }
      }, DIAGRAM.stepMs);
    }, DIAGRAM.autoplayDelayMs);
  }, [total]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    setEntered((current) => current ?? false);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = Boolean(entries[0]?.isIntersecting);
        visibleRef.current = visible;
        if (visible && !enteredRef.current) {
          enteredRef.current = true;
          setEntered(true);
        }
        if (visible) startAutoplay();
        else stopAutoplay();
      },
      { threshold: DIAGRAM.threshold },
    );
    observer.observe(root);
    const onVisibility = () => {
      if (document.hidden) stopAutoplay();
      else startAutoplay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stopAutoplay();
    };
  }, [startAutoplay, stopAutoplay]);

  React.useEffect(() => {
    if (paused || reducedMotion) stopAutoplay();
    else startAutoplay();
  }, [paused, reducedMotion, startAutoplay, stopAutoplay]);

  const handleEnter = (index: number) => {
    window.clearTimeout(leaveRef.current);
    window.clearTimeout(hoverRef.current);
    hoverRef.current = window.setTimeout(() => {
      engagedRef.current = true;
      setActive(index);
    }, DIAGRAM.hoverIntentMs);
  };

  const handleLeave = () => {
    window.clearTimeout(hoverRef.current);
    window.clearTimeout(leaveRef.current);
    leaveRef.current = window.setTimeout(() => {
      engagedRef.current = false;
    }, DIAGRAM.leaveGraceMs);
  };

  React.useEffect(
    () => () => {
      window.clearTimeout(hoverRef.current);
      window.clearTimeout(leaveRef.current);
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      className="journey-diagram"
      data-entered={entered === null ? undefined : String(entered)}
      aria-hidden="true"
    >
      <div className="journey-panels">
        {props.stages.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.icon] ?? Plant;
          return (
            <div
              key={stage.title}
              className="journey-panel"
              style={{ animationDelay: `${index * DIAGRAM.floatDelayStepSeconds}s` }}
            >
              <div
                className="journey-panel-card"
                data-active={String(index === active)}
                style={{ "--journey-index": index } as React.CSSProperties}
                onPointerEnter={() => handleEnter(index)}
                onPointerLeave={handleLeave}
              >
                <Icon size={28} weight="regular" />
                <span className="journey-panel-title">{stage.title}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="journey-carousel">
        <p className="journey-carousel-caption">{props.stages[active]?.caption}</p>
        <div className="journey-dots">
          {props.stages.map((stage, index) => (
            <span
              key={stage.title}
              className="journey-dot"
              data-active={String(index === active)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Parallax on the light-beam artwork only: the image overhangs its box by
// PARALLAX_PX at both ends and translates with the section's viewport position.
// Stops when paused, under reduced motion, offscreen or hidden.
export function BeamParallax(props: {
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { paused, reducedMotion } = useLandingMotion();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (pausedRef.current) return;
      const section = el.closest("section");
      const img = el.querySelector("img");
      if (!section || !img) return;
      const rect = section.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const offset = parallaxOffset({
        viewportHeight: window.innerHeight,
        sectionCenterY: rect.top + rect.height / 2,
        sectionHeight: rect.height,
      });
      img.style.transform = `translateY(${offset}px)`;
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(raf);
      // Reduced motion switched on mid-visit: settle the artwork at rest.
      el.querySelector("img")?.style.removeProperty("transform");
    };
  }, [reducedMotion]);

  return (
    <div ref={ref} className={props.className}>
      {props.children}
    </div>
  );
}
