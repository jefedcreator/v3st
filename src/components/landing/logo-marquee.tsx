"use client";

import * as React from "react";

import { useLandingMotion } from "./landing-motion";
import { logoMarqueeDurationSeconds } from "./motion/contract";

// The "Built to work with" marks. From 768px up they wrap into Katana's
// centred grid and nothing moves. Below 768px they form one horizontal row
// that scrolls on its own: the server-rendered list, then an aria-hidden and
// inert duplicate so the loop is seamless, moving translateX(0 -> -50%). It
// pauses on hover and focus, when the page motion is paused, and when
// offscreen or hidden (data-offscreen). Under reduced motion there is no
// animation and no duplicate: the row stays still and can be swiped.
export function LogoMarquee(props: {
  children: React.ReactNode;
  brandCount: number;
  label: string;
}): React.JSX.Element {
  const { reducedMotion } = useLandingMotion();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let intersecting = true;
    const sync = () => {
      viewport.dataset.offscreen = String(!intersecting || document.hidden);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        intersecting = Boolean(entries[0]?.isIntersecting);
        sync();
      },
      { threshold: 0 },
    );
    observer.observe(viewport);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const style = {
    "--logo-marquee-duration": `${logoMarqueeDurationSeconds(props.brandCount)}s`,
  } as React.CSSProperties;

  return (
    <div ref={viewportRef} className="logo-marquee" data-offscreen="false" style={style}>
      <div className="logo-marquee-track">
        <ul aria-label={props.label} className="built-with-row">
          {props.children}
        </ul>
        {reducedMotion ? null : (
          <ul aria-hidden="true" inert className="built-with-row logo-marquee-duplicate">
            {props.children}
          </ul>
        )}
      </div>
    </div>
  );
}
