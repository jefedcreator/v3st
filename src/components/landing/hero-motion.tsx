"use client";

import * as React from "react";

import { prefersReducedMotion, useLandingMotion } from "./landing-motion";
import {
  HERO_GROUPS,
  MAX_FRAME_MS,
  NAV_CUE,
  SKIP_INTRO_ELAPSED_MS,
  flowHandoverProgress,
  heroFits,
  heroLayoutFrame,
  heroTargetProgress,
  shouldPlayIntro,
  smoothProgress,
} from "./motion/contract";

const INTRO_END_MS = NAV_CUE.fromMs + NAV_CUE.spanMs;

// Every property and attribute this island writes onto the shared
// [data-landing] root. The (marketing) layout outlives the home page across
// client navigations, so unmounting must remove all of them: /legal/* and
// /waitlist then fall back to the CSS defaults (a settled header).
const ROOT_PROPERTIES = [
  ...HERO_GROUPS.map((group) => `--hero-${group}`),
  "--nav-cue",
  "--header-cta",
];
const ROOT_ATTRIBUTES = ["heroFit", "headerCtaHidden"] as const;

// Drives the hero choreography: writes --hero-<group>, --nav-cue and
// --header-cta plus data-hero-fit / data-header-cta-hidden onto the
// [data-landing] root, from one rAF loop that reads only refs and writes
// straight to the DOM — no React state per frame. The loop stops when the
// intro has finished and the scroll handover is settled, and wakes on scroll,
// resize, visibility or content-size changes. Layout is measured only on
// resize, never per frame.
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
  const refitRef = React.useRef<(() => void) | null>(null);
  const wakeRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const root = wrap?.closest<HTMLElement>("[data-landing]") ?? null;
    const track = wrap?.querySelector<HTMLElement>("[data-hero-track]") ?? null;
    if (!wrap || !root || !track) return;
    // The provider's reduced-motion state arrives after this effect; read the
    // preference directly so a reduced-motion visitor never sees a blank frame.
    if (prefersReducedMotion()) reducedMotionRef.current = true;

    const groups = Array.from(wrap.querySelectorAll<HTMLElement>("[data-hero-group]"));
    const copy = track.querySelector<HTMLElement>(".hero-copy");
    const rail = track.querySelector<HTMLElement>('[data-hero-group="rail"]');

    let fit = false;
    // The copy block and the rail are measured on their own: .hero-inner
    // stretches to the stage, so its height says nothing about the content,
    // and its padding is what the fit clearance already stands in for
    // (counting both kept laptops out of the pin).
    const refit = () => {
      fit = heroFits({
        viewportHeight: window.innerHeight,
        contentHeight: copy?.offsetHeight ?? 0,
        railHeight: rail?.offsetHeight ?? 0,
        reducedMotion: reducedMotionRef.current,
      });
    };
    // Pinned, progress runs along the 160vh track; in ordinary flow it follows
    // the hero scrolling out of view and only drives the header button.
    const targetProgress = (): number => {
      const rect = track.getBoundingClientRect();
      return fit ? heroTargetProgress(rect, window.innerHeight) : flowHandoverProgress(rect);
    };

    refit();
    const playIntro = shouldPlayIntro({
      hydratedAtMs: performance.now(),
      scrollY: window.scrollY,
      hash: window.location.hash,
    });
    const state = {
      elapsed: playIntro ? 0 : SKIP_INTRO_ELAPSED_MS,
      progress: targetProgress(),
      last: performance.now(),
      running: false,
      raf: 0,
    };
    stateRef.current = state;

    const apply = () => {
      if (reducedMotionRef.current) {
        for (const group of HERO_GROUPS) root.style.setProperty(`--hero-${group}`, "1");
        root.style.setProperty("--nav-cue", "1");
        root.style.setProperty("--header-cta", "1");
        root.dataset.heroFit = "false";
        root.dataset.headerCtaHidden = "false";
        for (const group of groups) group.dataset.heroDim = "false";
        return;
      }
      const frame = heroLayoutFrame({ elapsedMs: state.elapsed, progress: state.progress, fit });
      for (const group of HERO_GROUPS) {
        root.style.setProperty(`--hero-${group}`, String(frame[group]));
      }
      for (const el of groups) {
        const group = el.dataset.heroGroup as (typeof HERO_GROUPS)[number];
        el.dataset.heroDim = String(frame[group] < 0.01);
      }
      root.style.setProperty("--nav-cue", String(frame.navCue));
      root.style.setProperty("--header-cta", String(frame.headerCta));
      root.dataset.heroFit = String(fit);
      root.dataset.headerCtaHidden = String(frame.headerCta < 0.01);
    };

    const tick = (now: number) => {
      state.raf = 0;
      const dt = Math.min(now - state.last, MAX_FRAME_MS);
      state.last = now;
      if (!pausedRef.current) {
        state.elapsed += dt;
      }
      const target = targetProgress();
      state.progress = smoothProgress(state.progress, target, dt);
      apply();
      const settled =
        state.elapsed >= INTRO_END_MS && Math.abs(state.progress - target) < 1e-4;
      if (settled || reducedMotionRef.current) {
        state.running = false;
        return;
      }
      state.running = true;
      state.raf = window.requestAnimationFrame(tick);
    };

    const wake = () => {
      if (state.running || reducedMotionRef.current || document.hidden) return;
      state.running = true;
      state.last = performance.now();
      if (!state.raf) state.raf = window.requestAnimationFrame(tick);
    };

    const onResize = () => {
      refit();
      apply();
      wake();
    };

    // The first apply sets data-hero-fit, so the track takes its real height;
    // only then is the current scroll position's progress meaningful (a
    // restored or deep-linked scroll starts where it is, without a sweep).
    apply();
    state.progress = targetProgress();
    apply();
    applyRef.current = apply;
    refitRef.current = refit;
    wakeRef.current = wake;
    if (!reducedMotionRef.current) {
      state.running = true;
      state.raf = window.requestAnimationFrame(tick);
    }

    const onScroll = () => wake();
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
    // Watch the copy and the rail, not the track or the stage: their heights
    // change when data-hero-fit flips, and that must not feed back into the
    // fit decision. The copy and the rail keep their content height in either
    // layout.
    const observer = new ResizeObserver(onResize);
    if (copy) observer.observe(copy);
    if (rail) observer.observe(rail);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (state.raf) window.cancelAnimationFrame(state.raf);
      observer.disconnect();
      applyRef.current = null;
      refitRef.current = null;
      wakeRef.current = null;
      stateRef.current = null;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const property of ROOT_PROPERTIES) root.style.removeProperty(property);
      for (const attribute of ROOT_ATTRIBUTES) delete root.dataset[attribute];
      for (const group of groups) delete group.dataset.heroDim;
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

  // Reduced motion is observed live: turning it on settles every group at full
  // opacity in ordinary flow; turning it off re-measures the fit and resumes
  // from the current scroll position with the intro already complete. The
  // mount pass is skipped: the main effect has already initialised everything.
  const lastReducedRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    const previous = lastReducedRef.current;
    lastReducedRef.current = reducedMotion;
    const state = stateRef.current;
    if (previous === null || previous === reducedMotion || !state) return;
    if (!reducedMotion) state.elapsed = Math.max(state.elapsed, SKIP_INTRO_ELAPSED_MS);
    refitRef.current?.();
    applyRef.current?.();
    wakeRef.current?.();
  }, [reducedMotion]);

  return (
    <div ref={wrapRef} className="hero-motion">
      {props.children}
    </div>
  );
}
