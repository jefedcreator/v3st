"use client";

import * as React from "react";

import { useLandingMotion } from "./landing-motion";
import {
  HERO_GROUPS,
  MAX_FRAME_MS,
  NAV_CUE,
  SKIP_INTRO_ELAPSED_MS,
  heroFits,
  heroFrame,
  heroTargetProgress,
  shouldPlayIntro,
  smoothProgress,
  type HeroGroup,
} from "./motion/contract";

const INTRO_END_MS = NAV_CUE.fromMs + NAV_CUE.spanMs;

// Drives the hero choreography: writes --hero-<group>, --nav-cue and
// --header-cta plus data-hero-fit / data-header-cta-hidden onto the
// [data-landing] root, from one rAF loop that reads only refs and writes
// straight to the DOM — no React state per frame. The loop stops when the
// intro has finished and the scroll handover is settled, and wakes on scroll,
// resize, visibility or content-size changes.
export function HeroMotion(props: { children: React.ReactNode }): React.JSX.Element {
  const { paused, reducedMotion } = useLandingMotion();
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;
  const reducedMotionRef = React.useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const stateRef = React.useRef<{
    elapsed: number;
    progress: number;
    last: number;
    running: boolean;
    raf: number;
  } | null>(null);
  const applyRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const root = wrap?.closest<HTMLElement>("[data-landing]") ?? null;
    const track = wrap?.querySelector<HTMLElement>("[data-hero-track]") ?? null;
    if (!wrap || !root || !track) return;

    const groups = Array.from(
      wrap.querySelectorAll<HTMLElement>("[data-hero-group]"),
    );

    const playIntro = shouldPlayIntro({
      hydratedAtMs: performance.now(),
      scrollY: window.scrollY,
      hash: window.location.hash,
    });
    const state = {
      elapsed: playIntro ? 0 : SKIP_INTRO_ELAPSED_MS,
      progress: heroTargetProgress(track.getBoundingClientRect(), window.innerHeight),
      last: performance.now(),
      running: false,
      raf: 0,
    };
    stateRef.current = state;

    const computeFit = (): boolean => {
      const content = track.querySelector<HTMLElement>(".hero-inner");
      const rail = track.querySelector<HTMLElement>('[data-hero-group="rail"]');
      return heroFits({
        viewportHeight: window.innerHeight,
        contentHeight: content?.offsetHeight ?? 0,
        railHeight: rail?.offsetHeight ?? 0,
        reducedMotion: reducedMotionRef.current,
      });
    };

    const apply = () => {
      const frame = heroFrame({ elapsedMs: state.elapsed, progress: state.progress });
      if (reducedMotionRef.current) {
        for (const group of HERO_GROUPS) root.style.setProperty(`--hero-${group}`, "1");
        root.style.setProperty("--nav-cue", "1");
        root.style.setProperty("--header-cta", "1");
        root.dataset.heroFit = "false";
        for (const group of groups) group.dataset.heroDim = "false";
        return;
      }
      for (const group of HERO_GROUPS) {
        const value = frame[group];
        root.style.setProperty(`--hero-${group}`, String(value));
        for (const el of groups) {
          if (el.dataset.heroGroup === group) el.dataset.heroDim = String(value < 0.01);
        }
      }
      root.style.setProperty("--nav-cue", String(frame.navCue));
      root.style.setProperty("--header-cta", String(frame.headerCta));
      root.dataset.heroFit = String(computeFit());
      root.dataset.headerCtaHidden = String(frame.headerCta < 0.01);
    };

    const tick = (now: number) => {
      state.raf = 0;
      const dt = Math.min(now - state.last, MAX_FRAME_MS);
      state.last = now;
      if (!pausedRef.current) {
        state.elapsed += dt;
      }
      const target = heroTargetProgress(track.getBoundingClientRect(), window.innerHeight);
      state.progress = smoothProgress(state.progress, target, dt);
      apply();
      const settled =
        state.elapsed >= INTRO_END_MS && Math.abs(state.progress - target) < 1e-4;
      if (settled) {
        state.running = false;
        return;
      }
      state.running = true;
      state.raf = window.requestAnimationFrame(tick);
    };

    const wake = () => {
      if (state.running || reducedMotionRef.current) return;
      state.running = true;
      state.last = performance.now();
      if (!state.raf) state.raf = window.requestAnimationFrame(tick);
    };

    apply();
    applyRef.current = apply;
    state.running = true;
    state.raf = window.requestAnimationFrame(tick);

    const onScroll = () => wake();
    const onResize = () => {
      apply();
      wake();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        state.last = performance.now();
        wake();
      } else if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.running = false;
      }
    };
    const observer = new ResizeObserver(() => {
      apply();
      wake();
    });
    observer.observe(track);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (state.raf) window.cancelAnimationFrame(state.raf);
      observer.disconnect();
      applyRef.current = null;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Pausing before the intro ends jumps the intro to its end; the scroll
  // handover keeps following the scroll because it is not autoplay.
  React.useEffect(() => {
    const state = stateRef.current;
    if (state && paused && state.elapsed < INTRO_END_MS) {
      state.elapsed = SKIP_INTRO_ELAPSED_MS;
      state.last = performance.now();
      applyRef.current?.();
    }
  }, [paused]);

  // Reduced motion settles every group at full opacity in ordinary flow.
  React.useEffect(() => {
    if (!reducedMotion) return;
    const root = wrapRef.current?.closest<HTMLElement>("[data-landing]") ?? null;
    if (!root) return;
    for (const group of HERO_GROUPS) root.style.setProperty(`--hero-${group}`, "1");
    root.style.setProperty("--nav-cue", "1");
    root.style.setProperty("--header-cta", "1");
    root.dataset.heroFit = "false";
  }, [reducedMotion]);

  return (
    <div ref={wrapRef} className="hero-motion">
      {props.children}
    </div>
  );
}
