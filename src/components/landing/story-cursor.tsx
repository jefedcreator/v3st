"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useLandingMotion } from "./landing-motion";
export function StoryCursor({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { paused, reducedMotion } = useLandingMotion();
  useEffect(() => {
    const wrapper = ref.current,
      link = wrapper?.querySelector("a"),
      follower = wrapper?.querySelector<HTMLElement>(".story-follower");
    const media = matchMedia("(pointer:fine)");
    if (
      !wrapper ||
      !link ||
      !follower ||
      paused ||
      reducedMotion ||
      !media.matches
    )
      return;
    let id = 0,
      last = 0,
      x = 0,
      y = 0,
      tx = 0,
      ty = 0;
    const tick = (now: number) => {
      const factor =
        1 - Math.pow(0.8, Math.min(last ? now - last : 16.67, 64) / 16.67);
      last = now;
      x += (tx - x) * factor;
      y += (ty - y) * factor;
      follower.style.transform = `translate(${x}px,${y}px)`;
      if (Math.abs(x - tx) + Math.abs(y - ty) > 0.1)
        id = requestAnimationFrame(tick);
      else id = 0;
    };
    const move = (event: PointerEvent) => {
      const rect = wrapper.getBoundingClientRect();
      tx = event.clientX - rect.left;
      ty = event.clientY - rect.top;
      if (!id) id = requestAnimationFrame(tick);
    };
    const enter = () => {
      wrapper.dataset.cursor = "true";
    };
    const leave = () => {
      wrapper.dataset.cursor = "false";
      wrapper.dataset.pressed = "false";
      cancelAnimationFrame(id);
      id = 0;
      last = 0;
    };
    const down = () => {
      wrapper.dataset.pressed = "true";
    };
    const up = () => {
      wrapper.dataset.pressed = "false";
    };
    const hide = () => {
      if (document.hidden) leave();
    };
    link.addEventListener("pointermove", move);
    link.addEventListener("pointerenter", enter);
    link.addEventListener("pointerleave", leave);
    link.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("visibilitychange", hide);
    return () => {
      leave();
      link.removeEventListener("pointermove", move);
      link.removeEventListener("pointerenter", enter);
      link.removeEventListener("pointerleave", leave);
      link.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [paused, reducedMotion]);
  return (
    <div ref={ref} className="story-cursor">
      {children}
      <span className="story-follower" aria-hidden="true">
        <span>Explore demo</span>
      </span>
    </div>
  );
}
