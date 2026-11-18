"use client";

import * as React from "react";

import { useLandingMotion } from "./landing-motion";
import { CURSOR, followerStep } from "./motion/contract";

// The cursor follower for elements carrying data-cursor-label, on mouse
// pointers only. Position eases with followerStep (0.20 per frame), opacity
// and scale are CSS transitions with the CURSOR timings. The link underneath
// stays a normal, focusable link.
export function CursorFollower(): React.JSX.Element {
  const { reducedMotion } = useLandingMotion();
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;
    let raf = 0;
    let last = performance.now();
    const pos = { x: -100, y: -100 };
    const target = { x: -100, y: -100 };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      target.x = event.clientX;
      target.y = event.clientY;
      const over = (event.target as Element | null)?.closest?.("[data-cursor-label]");
      if (over) {
        el.textContent = over.getAttribute("data-cursor-label") ?? "";
        el.dataset.shown = "true";
      } else {
        el.dataset.shown = "false";
      }
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") el.dataset.pressed = "true";
    };
    const onUp = () => {
      el.dataset.pressed = "false";
    };
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      pos.x = followerStep(pos.x, target.x, dt);
      pos.y = followerStep(pos.y, target.y, dt);
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      raf = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      className="cursor-follower"
      data-shown="false"
      data-pressed="false"
      data-fade-ms={CURSOR.fadeMs}
      data-scale-ms={CURSOR.scaleMs}
      aria-hidden="true"
    />
  );
}
