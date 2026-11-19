"use client";

import * as React from "react";

import { useLandingMotion } from "./landing-motion";
import { CURSOR, MAX_FRAME_MS, followerStep } from "./motion/contract";

// The cursor follower for elements carrying data-cursor-label, on mouse
// pointers only. Position eases with followerStep (0.20 per frame), opacity
// and scale are CSS transitions with the CURSOR timings. The link underneath
// stays a normal, focusable link. No loop runs while the pointer is still.
export function CursorFollower(): React.JSX.Element {
  const { reducedMotion } = useLandingMotion();
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;
    let raf = 0;
    let last = 0;
    const pos = { x: -100, y: -100 };
    const target = { x: -100, y: -100 };

    // The loop runs only while the follower is catching up with the pointer
    // and stops once it has settled; a pointer move restarts it.
    const tick = (now: number) => {
      const dt = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      pos.x = followerStep(pos.x, target.x, dt);
      pos.y = followerStep(pos.y, target.y, dt);
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      const settled = Math.abs(target.x - pos.x) < 0.1 && Math.abs(target.y - pos.y) < 0.1;
      raf = settled ? 0 : window.requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || document.hidden) return;
      last = performance.now();
      raf = window.requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      target.x = event.clientX;
      target.y = event.clientY;
      const over = (event.target as Element | null)?.closest?.("[data-cursor-label]");
      if (over) {
        el.textContent = over.getAttribute("data-cursor-label") ?? "";
        if (el.dataset.shown !== "true") {
          // Appear at the pointer rather than gliding in from the last spot.
          pos.x = target.x;
          pos.y = target.y;
        }
        el.dataset.shown = "true";
      } else {
        el.dataset.shown = "false";
      }
      wake();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") el.dataset.pressed = "true";
    };
    const onUp = () => {
      el.dataset.pressed = "false";
    };
    const onLeave = () => {
      el.dataset.shown = "false";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.cancelAnimationFrame(raf);
      el.dataset.shown = "false";
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
