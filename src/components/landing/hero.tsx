import { Button } from "@/primitives";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { GrowthArtwork } from "./growth-artwork";

const RAIL = [
  "Add naira",
  "Explore stocks",
  "Choose a strategy",
  "Review proceeds",
] as const;

export function Hero() {
  return (
    <div data-hero-track className="relative h-[160vh]">
      <div
        data-hero-stage
        className="sticky top-0 h-dvh overflow-hidden"
      >
        <div data-hero-group="background" className="absolute inset-0">
          <GrowthArtwork className="absolute inset-0" />
          <div data-hero-fluid-slot className="absolute inset-0" />
          <div className="absolute inset-0 bg-canvas/55" aria-hidden="true" />
        </div>
        <div
          data-hero-content
          className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col items-center justify-center px-6 text-center"
        >
          <h1
            data-hero-group="heading"
            className="max-w-5xl text-[clamp(2.75rem,6.67vw,6rem)] leading-[1.05] font-bold tracking-[-0.04em] text-balance text-ink"
          >
            Start with naira. See investing clearly.
          </h1>
          <p
            data-hero-group="copy"
            className="mt-6 max-w-xl text-lg text-ink-muted text-balance md:text-xl"
          >
            Explore fractional tokenized stock exposure, understand the fees,
            and follow eligible earnings through to a bank payout.
          </p>
          <div
            data-hero-group="actions"
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg">
              <a href="#demo">
                Explore a demo
                <ArrowRight className="size-4" weight="bold" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
          <p data-hero-group="actions" className="mt-4 text-sm text-ink-muted">
            An illustrative preview. No account required.
          </p>
          <ol
            data-hero-group="rail"
            className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-ink-muted"
          >
            {RAIL.map((label, index) => (
              <li key={label} className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-sage text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
