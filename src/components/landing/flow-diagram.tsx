"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bank,
  ChartPieSlice,
  ArrowsSplit,
  ArrowUpRight,
} from "@phosphor-icons/react/dist/ssr";
import { useDecorationVisibility, useLandingMotion } from "./landing-motion";
const nodes = [
  { label: "Add naira", detail: "Understand the breakdown", Icon: Bank },
  {
    label: "Explore stocks",
    detail: "See the fractional quantity",
    Icon: ChartPieSlice,
  },
  {
    label: "Choose a strategy",
    detail: "Optional, separate choice",
    Icon: ArrowsSplit,
  },
  {
    label: "Review proceeds",
    detail: "Payout or reinvest",
    Icon: ArrowUpRight,
  },
] as const;
export function FlowDiagram() {
  const { ref, visible } = useDecorationVisibility<HTMLDivElement>();
  const { paused, reducedMotion } = useLandingMotion();
  const [active, setActive] = useState(0);
  const [entered, setEntered] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const intent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (paused || reducedMotion) setIntroDone(true);
  }, [paused, reducedMotion]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.intersectionRatio >= 0.2) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  useEffect(() => {
    if (paused || reducedMotion || !visible || engaged) return;
    const timer = setInterval(
      () => setActive((value) => (value + 1) % 4),
      3600,
    );
    return () => clearInterval(timer);
  }, [paused, reducedMotion, visible, engaged]);
  useEffect(() => {
    const el = ref.current;
    if (!el || paused || reducedMotion || !visible) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const value =
        Math.max(
          -1,
          Math.min(
            1,
            (innerHeight / 2 - (rect.top + rect.height / 2)) /
              ((innerHeight + rect.height) / 2),
          ),
        ) * 70;
      el.style.setProperty("--diagram-parallax", `${value}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      el.style.removeProperty("--diagram-parallax");
    };
  }, [ref, paused, reducedMotion, visible]);
  useEffect(
    () => () => {
      if (intent.current) clearTimeout(intent.current);
      if (grace.current) clearTimeout(grace.current);
    },
    [],
  );
  const hover = (index: number) => {
    if (grace.current) clearTimeout(grace.current);
    if (intent.current) clearTimeout(intent.current);
    intent.current = setTimeout(() => {
      setEngaged(true);
      setActive(index);
    }, 120);
  };
  const leave = () => {
    if (intent.current) clearTimeout(intent.current);
    grace.current = setTimeout(() => setEngaged(false), 140);
  };
  return (
    <div
      ref={ref}
      className="flow-diagram"
      data-entered={entered && !introDone}
      data-stopped={paused || reducedMotion || !visible}
      aria-label="Illustrative investing journey"
    >
      <div className="flow-contours" aria-hidden="true">
        <svg viewBox="0 0 700 420" fill="none">
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse
              key={i}
              cx="350"
              cy="220"
              rx={160 + i * 28}
              ry={60 + i * 19}
              stroke="currentColor"
              opacity={0.08}
            />
          ))}
        </svg>
      </div>
      <div className="flow-path" aria-hidden="true" />
      {nodes.map(({ label, detail, Icon }, index) => (
        <div
          className="flow-node"
          key={label}
          onAnimationEnd={(event) => {
            if (index === 3 && event.animationName === "flow-enter")
              setIntroDone(true);
          }}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <button
            className="flow-tile"
            data-active={active === index}
            style={{ animationDelay: `${index * -1.3}s` }}
            onPointerEnter={() => hover(index)}
            onPointerLeave={leave}
            onFocus={() => {
              if (grace.current) clearTimeout(grace.current);
              setEngaged(true);
              setActive(index);
            }}
            onBlur={() => setEngaged(false)}
            aria-label={`Highlight ${label}`}
          >
            <Icon aria-hidden="true" />
            <strong>{label}</strong>
            <span>{detail}</span>
          </button>
        </div>
      ))}
      <p className="flow-note">
        A way to understand the steps.
        <br />
        Exploring this diagram makes no selection.
      </p>
    </div>
  );
}
