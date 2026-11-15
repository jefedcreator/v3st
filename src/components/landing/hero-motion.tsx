"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  HERO_GROUPS,
  HERO_INTRO_TOTAL_MS,
  heroFrame,
  heroProgress,
  smoothProgress,
  type HeroGroup,
} from "./motion-contract";
import { useLandingMotion } from "./landing-motion";

const FluidBackground = dynamic(
  () =>
    import("./fluid-background").then((mod) => mod.FluidBackground),
  { ssr: false },
);

const NAV_HIDDEN_TOP_PX = -120;
const NAV_LOGO_HIDDEN_PCT = -160;
const FLUID_DELAY_MS = 900;

export function HeroMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fluidSlot, setFluidSlot] = useState<HTMLElement | null>(null);
  const [fluidReady, setFluidReady] = useState(false);
  const { reducedMotion } = useLandingMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const slot = root.querySelector<HTMLElement>("[data-hero-fluid-slot]");
    if (slot) setFluidSlot(slot);
  }, []);

  useEffect(() => {
    if (!fluidSlot || reducedMotion) return;
    const timer = window.setTimeout(() => setFluidReady(true), FLUID_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [fluidSlot, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (reducedMotion) {
      root.dataset.heroMotion = "static";
      root.dataset.heroFit = "flow";
      return;
    }
    root.dataset.heroMotion = "live";

    const page = root.closest<HTMLElement>("[data-landing-page]") ?? document.body;
    const track = root.querySelector<HTMLElement>("[data-hero-track]");
    const stage = root.querySelector<HTMLElement>("[data-hero-stage]");
    if (!track || !stage) return;

    const groups = new Map<HeroGroup, HTMLElement[]>(
      HERO_GROUPS.map((group) => [
        group,
        Array.from(
          root.querySelectorAll<HTMLElement>(`[data-hero-group="${group}"]`),
        ),
      ]),
    );
    const navShell = page.querySelector<HTMLElement>("[data-nav-shell]");
    const navLogo = page.querySelector<HTMLElement>("[data-nav-logo]");
    const headerCta = page.querySelector<HTMLElement>("[data-header-cta]");

    let raf = 0;
    let last = performance.now();
    let elapsed = window.scrollY > 4 ? HERO_INTRO_TOTAL_MS : 0;
    let q = 0;
    let actionsForced = false;

    const initialRect = track.getBoundingClientRect();
    q = heroProgress(initialRect.top, initialRect.height, window.innerHeight);

    const apply = (frame: ReturnType<typeof heroFrame>) => {
      for (const group of HERO_GROUPS) {
        let opacity = frame[group];
        if (group === "actions" && actionsForced) opacity = 1;
        for (const el of groups.get(group) ?? []) {
          el.style.opacity = opacity.toFixed(4);
          if (group === "actions") {
            el.style.pointerEvents = opacity < 0.01 ? "none" : "";
          }
        }
      }
      if (navShell) {
        navShell.style.top = `${NAV_HIDDEN_TOP_PX * (1 - frame.navReveal)}px`;
      }
      if (navLogo) {
        navLogo.style.transform = `translateY(${NAV_LOGO_HIDDEN_PCT * (1 - frame.navReveal)}%)`;
      }
      if (headerCta) {
        headerCta.style.opacity = frame.ctaReveal.toFixed(4);
        headerCta.style.transform = `translateY(${NAV_LOGO_HIDDEN_PCT * (1 - frame.ctaReveal)}%)`;
      }
    };

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      elapsed += dt;
      const rect = track.getBoundingClientRect();
      const target = heroProgress(rect.top, rect.height, window.innerHeight);
      q = smoothProgress(q, target, dt);
      apply(heroFrame({ elapsedMs: elapsed, progress: q }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame((now) => {
      last = now;
      raf = requestAnimationFrame(tick);
    });

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('[data-hero-group="actions"]')
      ) {
        actionsForced = true;
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('[data-hero-group="actions"]') &&
        !(event.relatedTarget instanceof HTMLElement &&
          event.relatedTarget.closest('[data-hero-group="actions"]'))
      ) {
        actionsForced = false;
      }
    };
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const fit = () => {
      const content = stage.querySelector<HTMLElement>("[data-hero-content]");
      if (!content) return;
      const fits =
        content.scrollHeight <= window.innerHeight * 0.92 &&
        window.innerHeight >= 480;
      root.dataset.heroFit = fits ? "stage" : "flow";
    };
    fit();
    window.addEventListener("resize", fit);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", fit);
    };
  }, [reducedMotion]);

  return (
    <div ref={rootRef} data-hero-motion="live" className="contents">
      {children}
      {fluidReady && fluidSlot
        ? createPortal(
            <FluidBackground className="absolute inset-0 size-full" />,
            fluidSlot,
          )
        : null}
    </div>
  );
}
