"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { heroFrame, clamp, smoothProgress } from "./motion-contract";
import { useLandingMotion } from "./landing-motion";

export function HeroMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  const { paused, reducedMotion } = useLandingMotion();

  useEffect(() => {
    const track = ref.current;
    const stage = track?.querySelector<HTMLElement>(".hero-stage");
    const content = track?.querySelector<HTMLElement>(".hero-content");
    const landing = track?.closest<HTMLElement>(".landing");
    if (!track || !stage || !content || !landing) return;
    let frameId = 0;
    let lastTime = 0;
    let elapsed = 5000;
    let progress = 0;
    let fits = false;
    let disposed = false;
    const intro =
      !entered.current &&
      performance.now() < 600 &&
      window.scrollY < 5 &&
      !window.location.hash;
    entered.current = true;
    if (intro && !paused && !reducedMotion) elapsed = 0;

    const measure = () => {
      const rail = stage.querySelector<HTMLElement>(".hero-rail");
      const needed = content.scrollHeight + (rail?.scrollHeight ?? 0) + 190;
      fits = window.innerHeight >= needed && !reducedMotion;
      track.dataset.fit = String(fits);
      landing.dataset.heroFit = String(fits);
    };
    measure();
    const target = () => {
      if (!fits) return 0;
      const rect = track.getBoundingClientRect();
      return clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
    };
    progress = target();

    const apply = () => {
      const value = heroFrame({ elapsedMs: elapsed, progress });
      if (paused || reducedMotion || !fits) {
        for (const key of [
          "background",
          "heading",
          "copy",
          "actions",
          "rail",
        ] as const)
          value[key] = 1;
        value.navReveal = 1;
        value.ctaReveal = 1;
      }
      for (const [key, opacity] of Object.entries(value))
        landing.style.setProperty(`--hero-${key}`, String(opacity));
      track.dataset.actionsHidden = String(value.actions < 0.01);
      landing.dataset.headerCtaHidden = String(value.ctaReveal < 0.01);
    };
    apply();
    const tick = (now: number) => {
      frameId = 0;
      if (disposed || document.hidden) return;
      const dt = lastTime ? Math.min(now - lastTime, 64) : 16.67;
      lastTime = now;
      if (!paused && !reducedMotion) elapsed += dt;
      const next = target();
      progress = smoothProgress(progress, next, dt);
      if (Math.abs(progress - next) < 0.0001) progress = next;
      apply();
      if (!paused && !reducedMotion && (elapsed < 3020 || progress !== next))
        frameId = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!frameId && !document.hidden) frameId = requestAnimationFrame(tick);
    };
    const resize = () => {
      measure();
      schedule();
    };
    const visibility = () => {
      lastTime = 0;
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else schedule();
    };
    // Native scrolling; no wheel interception or per-frame React state.
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [paused, reducedMotion]);

  return (
    <div className="hero-track" ref={ref}>
      {children}
    </div>
  );
}
