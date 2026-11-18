"use client";

import { Pause, Play } from "@phosphor-icons/react/dist/ssr";

import { useLandingMotion } from "./landing-motion";

// The page-wide pause control (WCAG 2.2.2). It sits at the header's right edge
// at every size and is never part of the navigation entrance, so it is visible
// from first paint. State lives in memory only.
export function PauseControl(): React.JSX.Element {
  const { paused, setPaused } = useLandingMotion();
  return (
    <button
      type="button"
      className="pause-control"
      aria-label={paused ? "Play motion" : "Pause motion"}
      aria-pressed={paused}
      onClick={() => setPaused(!paused)}
    >
      {paused ? (
        <Play aria-hidden="true" className="size-5" />
      ) : (
        <Pause aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
