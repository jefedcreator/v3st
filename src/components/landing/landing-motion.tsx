"use client";

import * as React from "react";

type LandingMotionContextValue = {
  paused: boolean;
  reducedMotion: boolean;
  setPaused: (value: boolean) => void;
};

const LandingMotionContext = React.createContext<LandingMotionContextValue | null>(null);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// The live preference, read directly. React runs child effects before parent
// effects, so on the first effect pass a motion island sees the provider's
// initial `reducedMotion: false` before the provider has read the media query.
// Islands whose first frame must already honour the preference (the hero, the
// counters) read it here as well as from the context.
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

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
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
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
