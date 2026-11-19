"use client";

import * as React from "react";

import { prefersReducedMotion, useLandingMotion } from "../landing-motion";
import { FLUID_COLORS, FLUID_SETTINGS } from "../motion/contract";
import { detectWebGL, shouldRunFluid } from "./fluid-gate";

// The fluid stays out of the server bundle: this file is its only importer and
// it loads the vendored component lazily.
const LiquidEther = React.lazy(() => import("./liquid-ether"));

// Catches a failed chunk load or a throw while the fluid initialises, so the
// failure stays inside the background: the fluid unmounts and the static glow
// remains, instead of the error reaching the page.
class FluidBoundary extends React.Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

// Always renders the static hero glow image (the no-WebGL/reduced-motion
// fallback). The fluid mounts only when the gate allows and only after two
// animation frames following hydration, so the hero text has painted. On
// context loss or any error it unmounts the fluid and keeps the static image.
// Reduced motion switched on mid-visit removes it again.
export function FluidBackground(): React.JSX.Element {
  const { paused, reducedMotion } = useLandingMotion();
  const [run, setRun] = React.useState(false);
  const [lost, setLost] = React.useState(false);
  const onLost = React.useCallback(() => setLost(true), []);

  React.useEffect(() => {
    const connection = (
      navigator as unknown as { connection?: { saveData?: boolean } }
    ).connection;
    const saveData = connection?.saveData ?? false;
    const allowed = shouldRunFluid({
      reducedMotion: reducedMotion || prefersReducedMotion(),
      saveData,
      webgl: detectWebGL(),
    });
    if (!allowed) {
      setRun(false);
      return;
    }
    let cancelled = false;
    let first = 0;
    let second = 0;
    first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        if (!cancelled) setRun(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [reducedMotion]);

  return (
    <div className="fluid-background">
      <picture>
        <source srcSet="/art/hero-glow.avif" type="image/avif" />
        <source srcSet="/art/hero-glow.webp" type="image/webp" />
        <img
          src="/art/hero-glow.webp"
          alt=""
          width={1600}
          height={900}
          fetchPriority="high"
          decoding="async"
          className="fluid-image"
        />
      </picture>
      {run && !lost ? (
        <div className="fluid-canvas" aria-hidden="true">
          <FluidBoundary onError={onLost}>
            <React.Suspense fallback={null}>
              <LiquidEther
                {...FLUID_SETTINGS}
                colors={FLUID_COLORS}
                paused={paused}
                onContextLost={onLost}
              />
            </React.Suspense>
          </FluidBoundary>
        </div>
      ) : null}
    </div>
  );
}
