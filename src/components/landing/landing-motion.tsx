"use client";

import * as React from "react";

type LandingMotionContextValue = {
  paused: boolean;
  reducedMotion: boolean;
  setPaused(value: boolean): void;
};

const LandingMotionContext = React.createContext<LandingMotionContextValue | null>(null);

export function useLandingMotion(): LandingMotionContextValue {
  const context = React.useContext(LandingMotionContext);
  if (!context) throw new Error("useLandingMotion must be used inside LandingMotionProvider");
  return context;
}

// One feature-scoped context for the page's motion islands. It mirrors its
// state onto the [data-landing] root (data-motion-paused / data-reduced-motion)
// so CSS loops can stop, observes prefers-reduced-motion live, and never
// touches storage.
export function LandingMotionProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [paused, setPausedState] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReducedMotion(media.matches);
      if (rootRef.current) rootRef.current.dataset.reducedMotion = String(media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  React.useEffect(() => {
    if (rootRef.current) rootRef.current.dataset.motionPaused = String(paused);
  }, [paused]);

  const setPaused = React.useCallback((value: boolean) => setPausedState(value), []);
  const value = React.useMemo(
    () => ({ paused, reducedMotion, setPaused }),
    [paused, reducedMotion, setPaused],
  );

  return (
    <LandingMotionContext.Provider value={value}>
      <div data-landing data-motion-paused="false" data-reduced-motion="false" ref={rootRef}>
        {props.children}
      </div>
    </LandingMotionContext.Provider>
  );
}
