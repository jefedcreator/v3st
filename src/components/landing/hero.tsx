import { ArrowDownRight, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
import { GrowthArtwork } from "./growth-artwork";
import { HeroMotion } from "./hero-motion";
import { FluidBackground } from "./fluid-background";

export function Hero() {
  return (
    <HeroMotion>
      <section className="hero-stage" aria-labelledby="hero-title">
        <div className="hero-background" data-hero-group="background">
          <GrowthArtwork />
          <FluidBackground />
        </div>
        <div className="hero-content shell">
          <h1 id="hero-title" data-hero-group="heading">
            Start with naira.
            <br />
            <span>See investing clearly.</span>
          </h1>
          <p className="hero-copy" data-hero-group="copy">
            Explore fractional tokenized stock exposure, understand the fees,
            and follow eligible earnings through to a bank payout.
          </p>
          <div className="hero-actions" data-hero-group="actions">
            <div className="cta-row">
              <Button asChild size="lg">
                <a href="#demo">
                  Explore a demo <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how-it-works">
                  How it works <ArrowDownRight aria-hidden="true" />
                </a>
              </Button>
            </div>
            <p className="hero-caption">
              An illustrative preview. No account required.
            </p>
          </div>
        </div>
        <ol
          className="hero-rail shell"
          data-hero-group="rail"
          aria-label="The investing journey"
        >
          {[
            "Add naira",
            "Explore stocks",
            "Choose a strategy",
            "Review proceeds",
          ].map((label, index) => (
            <li key={label}>
              <span className="rail-index" aria-hidden="true">
                0{index + 1}
              </span>
              {label}
              {index < 3 && <ArrowRight aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>
    </HeroMotion>
  );
}
