"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/utils/cn";
import { useLandingMotion } from "./landing-motion";
import {
  createFluidRenderer,
  fluidDefaults,
  type FluidRenderer,
} from "./fluid-renderer";

export function FluidBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { paused, reducedMotion } = useLandingMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;

    let renderer: FluidRenderer | null = null;
    try {
      renderer = createFluidRenderer(canvas, fluidDefaults);
    } catch {
      return;
    }

    let inView = true;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        inView = entry ? entry.isIntersecting : true;
        renderer?.setPaused(paused || !inView || document.hidden);
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    const onVisibility = () => {
      renderer?.setPaused(paused || !inView || document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onResize = () => renderer?.resize();
    window.addEventListener("resize", onResize);

    renderer.setPaused(paused || document.hidden);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      renderer?.dispose();
    };
  }, [paused, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("block h-full w-full", className)}
    />
  );
}
