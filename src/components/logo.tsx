// React stays in scope for the classic JSX transform the Vitest suite renders with.
import * as React from "react";

import { cn } from "@/utils/cn";

// The V3ST identity: the grain mark beside the product's name, set the way
// Parcours sets its own Logo.
//
// The mark's geometry is docs/brand/v3st-grain.svg, drawn by scripts/logo.mjs;
// tests/landing/logo.test.ts keeps the two identical.
//
// Everything is em-relative, so a caller sizes the whole lockup with one
// font-size (`<Logo className="text-[18px]" />`): the mark is 1.35em tall and
// sits 0.32em from the name. The name is live Archivo text at weight 700 and
// -0.03em, not outlined paths. Archivo is already loaded by the root layout,
// so the name stays selectable, reads as "V3ST" to a screen reader and follows
// the type scale. scripts/social-image.mjs and the lockup preview in
// scripts/logo.mjs repeat these numbers.

const GRAIN_VIEWBOX = "18.62 1.75 62.76 97.5";
const GRAIN_PATH =
  "M53.5 96L53.5 43L46.5 43L46.5 96ZM57.39 65.5A11.31 11.31 0 0 1 65.39 51.64A11.31 11.31 0 0 1 57.39 65.5ZM34.61 51.64A11.31 11.31 0 0 1 42.61 65.5A11.31 11.31 0 0 1 34.61 51.64ZM57.39 51.5A11.31 11.31 0 0 1 65.39 37.64A11.31 11.31 0 0 1 57.39 51.5ZM34.61 37.64A11.31 11.31 0 0 1 42.61 51.5A11.31 11.31 0 0 1 34.61 37.64ZM57.35 37.5A10.25 10.25 0 0 1 64.6 24.94A10.25 10.25 0 0 1 57.35 37.5ZM35.4 24.94A10.25 10.25 0 0 1 42.65 37.5A10.25 10.25 0 0 1 35.4 24.94ZM50 30.5A21.93 21.93 0 0 1 50 3.5A21.93 21.93 0 0 1 50 30.5ZM57 97.5A26.59 26.59 0 0 1 79.63 74.87A26.59 26.59 0 0 1 57 97.5ZM20.37 74.87A26.59 26.59 0 0 1 43 97.5A26.59 26.59 0 0 1 20.37 74.87Z";

type MarkProps = {
  /**
   * Draw the mark in mint, its colour on V3ST's dark ground. Turn it off for a
   * single-ink context, where the mark takes `currentColor` like the name.
   */
  accent?: boolean;
  className?: string;
};

/**
 * The grain alone, 1.35em tall so it tracks the font-size it sits in.
 * Decorative: in the lockup the name carries the label, and used bare the
 * caller owns it (see `Logo`).
 */
export function LogoMark({ accent = true, className }: MarkProps) {
  return (
    <svg
      viewBox={GRAIN_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      className={cn("h-[1.35em] w-auto shrink-0", className)}
    >
      <MarkPath accent={accent} />
    </svg>
  );
}

// A component rather than a ternary on `className`, so the accented path
// carries no `fill` attribute for a utility to compete with, and the plain
// one draws in `currentColor` even where the stylesheet hasn't loaded.
function MarkPath({ accent }: { accent: boolean }) {
  if (accent) return <path d={GRAIN_PATH} className="fill-gain" />;
  return <path d={GRAIN_PATH} fill="currentColor" />;
}

type LogoProps = MarkProps & {
  /** `lockup` is the mark beside the name; `mark` is the mark alone. */
  variant?: "lockup" | "mark";
};

/**
 * The lockup by default. Size it with one font-size utility, or with a CSS
 * class on the landing, where unlayered rules win over utilities.
 */
export function Logo({ variant = "lockup", accent = true, className }: LogoProps) {
  if (variant === "mark") {
    // Bare, the mark is the name, so the element a caller sizes carries it.
    return (
      <span role="img" aria-label="V3ST" className={cn("inline-flex", className)}>
        <LogoMark accent={accent} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "text-heading inline-flex items-center gap-[0.32em] text-[19px] leading-none font-bold tracking-[-0.03em]",
        className,
      )}
    >
      <LogoMark accent={accent} />
      V3ST
    </span>
  );
}
