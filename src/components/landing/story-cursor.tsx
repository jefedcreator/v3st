"use client";

import { useEffect, useRef, useState } from "react";
import { STORY_CURSOR } from "./motion-contract";
import { useLandingMotion } from "./landing-motion";

export function StoryCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const { paused, reducedMotion } = useLandingMotion();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const update = () => setEnabled(fine.matches && !reducedMotion && !paused);
    update();
    fine.addEventListener("change", update);
    return () => fine.removeEventListener("change", update);
  }, [reducedMotion, paused]);

  useEffect(() => {
    if (!enabled) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let shown = false;
    let pressed = false;
    let last = performance.now();

    const onMove = (event: PointerEvent) => {
      tx = event.clientX;
      ty = event.clientY;
      const overLink = (event.target as HTMLElement | null)?.closest?.(
        "[data-story-link]",
      );
      shown = Boolean(overLink);
    };
    const onDown = () => {
      pressed = true;
    };
    const onUp = () => {
      pressed = false;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 64);
      last = now;
      const k = 1 - (1 - STORY_CURSOR.smoothing) ** (dt / 16.67);
      x += (tx - x) * k;
      y += (ty - y) * k;
      const scale = !shown
        ? STORY_CURSOR.scaleHidden
        : pressed
          ? STORY_CURSOR.scalePressed
          : STORY_CURSOR.scaleShown;
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
      cursor.style.opacity = shown ? "1" : "0";
    };
    raf = requestAnimationFrame((now) => {
      last = now;
      raf = requestAnimationFrame(tick);
    });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-30 grid size-24 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground opacity-0 will-change-transform"
      style={{
        transition: `opacity ${STORY_CURSOR.opacityMs}ms ease-out, scale ${STORY_CURSOR.scaleTransitionMs}ms ease-out`,
      }}
    >
      Explore
    </div>
  );
}
