"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";

const MotionContext = createContext({ paused: false, reducedMotion: false });
export const useLandingMotion = () => useContext(MotionContext);

export function LandingMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <MotionContext.Provider value={{ paused, reducedMotion }}>
      <div
        className="landing"
        data-paused={paused}
        data-reduced-motion={reducedMotion}
      >
        {children}
        <div className="motion-control">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
            <span>{paused ? "Resume animations" : "Pause animations"}</span>
          </Button>
        </div>
      </div>
    </MotionContext.Provider>
  );
}

/** Every decorative island stops when hidden/offscreen, without a page-level frame loop. */
export function useDecorationVisibility<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let intersecting = false;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return { ref, visible };
}
