"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { DIAGRAM } from "./motion-contract";
import { useLandingMotion } from "./landing-motion";

const STAGES = [
  { id: "fund", label: "Fund with naira", detail: "Bank transfer in ₦ through a simulated ramp" },
  { id: "exposure", label: "Inspect exposure", detail: "Fractional tokenized stock quantities and costs" },
  { id: "strategy", label: "Choose a strategy", detail: "Separate, optional and explicit" },
  { id: "proceeds", label: "Review proceeds", detail: "Eligible confirmed proceeds, payout or reinvest" },
] as const;

export function FlowDiagram() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { paused, reducedMotion } = useLandingMotion();
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const motionLive = !reducedMotion && !paused;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: DIAGRAM.intersectionThreshold },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || paused || !entered) return;
    const timer = window.setInterval(() => {
      if (!engaged) setActive((a) => (a + 1) % STAGES.length);
    }, DIAGRAM.highlightMs);
    return () => window.clearInterval(timer);
  }, [reducedMotion, paused, entered, engaged]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion || paused) return;
    let raf = 0;
    const update = () => {
      const rect = root.getBoundingClientRect();
      const sectionCenterY = rect.top + rect.height / 2;
      const viewportHeight = window.innerHeight;
      const raw =
        (viewportHeight / 2 - sectionCenterY) /
        ((viewportHeight + rect.height) / 2);
      const clamped = Math.min(1, Math.max(-1, raw));
      const bg = root.querySelector<HTMLElement>("[data-diagram-parallax]");
      if (bg) bg.style.transform = `translateY(${clamped * DIAGRAM.parallaxPx}px)`;
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, paused]);

  const hoverTimerRef = useRef(0);
  const leaveTimerRef = useRef(0);
  const onIntent = (index: number) => {
    window.clearTimeout(leaveTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setEngaged(true);
      setActive(index);
    }, DIAGRAM.hoverIntentMs);
  };
  const onLeave = () => {
    window.clearTimeout(hoverTimerRef.current);
    leaveTimerRef.current = window.setTimeout(
      () => setEngaged(false),
      DIAGRAM.leaveGraceMs,
    );
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-rule bg-surface",
        motionLive && !entered && "diagram-motion-live",
        entered && "diagram-entered",
        !motionLive && "diagram-paused",
      )}
      aria-hidden="true"
    >
      <svg
        data-diagram-parallax
        className="absolute -inset-y-[70px] inset-x-0 h-[calc(100%+140px)] w-full will-change-transform"
        viewBox="0 0 800 400"
        preserveAspectRatio="xMidYMid slice"
      >
        <rect width="800" height="400" fill="#E6EEDD" />
        <path
          d="M -20 340 A 380 380 0 0 1 360 40"
          stroke="#B9D987"
          strokeWidth="60"
          fill="none"
        />
        <path
          d="M 60 400 A 300 300 0 0 1 360 160"
          stroke="#166534"
          strokeWidth="8"
          fill="none"
          opacity="0.35"
        />
      </svg>
      <ol className="relative grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, index) => (
          <li
            key={stage.id}
            className={cn("diagram-node diagram-tile rounded-xl border bg-canvas/80 p-4 backdrop-blur-sm", index === active && motionLive ? "border-primary" : "border-rule")}
            style={{
              transitionDelay: `${index * DIAGRAM.entranceStaggerMs}ms`,
              animationDelay: `${index * DIAGRAM.floatStaggerSeconds}s`,
              transitionDuration: `${DIAGRAM.hoverTransitionMs}ms`,
            }}
            onPointerEnter={() => onIntent(index)}
            onPointerLeave={onLeave}
            onFocus={() => onIntent(index)}
            onBlur={onLeave}
          >
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
              Step {index + 1}
            </span>
            <span className="mt-1 block text-sm font-semibold text-ink">
              {stage.label}
            </span>
            <span className="mt-1 block text-xs text-ink-muted">
              {stage.detail}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
