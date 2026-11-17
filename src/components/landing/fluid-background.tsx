"use client";
import { useEffect, useRef } from "react";
import type { createFluidRenderer } from "./fluid-renderer";
import { useDecorationVisibility, useLandingMotion } from "./landing-motion";

export function FluidBackground() {
  const { ref, visible } = useDecorationVisibility<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createFluidRenderer> | null>(null);
  const { paused, reducedMotion } = useLandingMotion();
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    if (reducedMotion || !visible) return;
    let cancelled = false;
    const element = canvas.current;
    if (!element) return;
    const destroy = () => {
      renderer.current?.dispose();
      renderer.current = null;
      element.style.opacity = "0";
      if (ref.current) ref.current.dataset.fluidState = "fallback";
    };
    const resize = () => {
      try {
        renderer.current?.resize();
      } catch {
        destroy();
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      destroy();
    };
    // Keep SVG and readable HTML present; request the GPU chunk only after initial paint.
    const timer = window.setTimeout(() => {
      void import("./fluid-renderer")
        .then(({ createFluidRenderer, fluidDefaults }) => {
          if (cancelled) return;
          try {
            renderer.current = createFluidRenderer(element, fluidDefaults);
            element.style.opacity = "1";
            if (ref.current) ref.current.dataset.fluidState = "ready";
            renderer.current.setPaused(pausedRef.current || document.hidden);
          } catch {
            destroy();
          }
        })
        .catch(destroy);
    }, 900);
    element.addEventListener("webglcontextlost", lost);
    window.addEventListener("resize", resize);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      destroy();
      element.removeEventListener("webglcontextlost", lost);
      window.removeEventListener("resize", resize);
    };
  }, [reducedMotion, visible, ref]);
  useEffect(() => {
    renderer.current?.setPaused(paused || reducedMotion || !visible);
  }, [paused, reducedMotion, visible]);
  return (
    <div
      ref={ref}
      className="fluid-background"
      data-fluid-state="static"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <canvas
        ref={canvas}
        style={{ width: "100%", height: "100%", opacity: 0 }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 44%,var(--color-background) 8%,transparent 75%)",
        }}
      />
    </div>
  );
}
