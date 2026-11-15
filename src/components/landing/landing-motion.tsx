"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/utils/cn";

type LandingMotionState = {
  paused: boolean;
  reducedMotion: boolean;
};

const LandingMotionContext = createContext<LandingMotionState | null>(null);

export function useLandingMotion(): LandingMotionState {
  const ctx = useContext(LandingMotionContext);
  if (!ctx) {
    throw new Error("useLandingMotion must be used inside <LandingMotion>");
  }
  return ctx;
}

export function LandingMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <LandingMotionContext.Provider value={{ paused, reducedMotion }}>
      {children}
      <button
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
        className={cn(
          "fixed right-4 bottom-4 z-40 inline-flex h-11 items-center gap-2 rounded-full border border-rule bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-sage",
          reducedMotion && "border-dashed",
        )}
      >
        {paused ? (
          <Play className="size-4" weight="fill" />
        ) : (
          <Pause className="size-4" weight="fill" />
        )}
        {paused ? "Resume animations" : "Pause animations"}
      </button>
    </LandingMotionContext.Provider>
  );
}
