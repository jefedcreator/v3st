import { HERO_COUNTERS, HERO_SUBLINE } from "./content";
import { Counter } from "./counter";
import { FluidBackground } from "./fluid/fluid-background";
import { HeroActions } from "./hero-actions";
import { HeroMotion } from "./hero-motion";

// The hero, in the katana.network pattern: the copy and its two pills centred
// on the stage, the counter rail along the stage's bottom edge, and a vertical
// shade with fine grain over the fluid. The DOM contract (data-hero-track,
// data-hero-group, data-figure) is what the choreography animates: each
// group's opacity is driven by --hero-<group>, which defaults to 1 so the page
// reads cleanly without JavaScript motion. The fit check measures .hero-copy
// and the rail. The static glow is also the fluid background's fallback.
export function Hero(): React.JSX.Element {
  return (
    <HeroMotion>
      <div data-hero-track className="hero-track">
        <section id="top" aria-labelledby="hero-title" className="hero">
          <div
            data-hero-group="background"
            className="hero-background"
            style={{ opacity: "var(--hero-background, 1)" }}
            aria-hidden="true"
          >
            <FluidBackground />
            <div className="hero-shade" />
          </div>
          <div className="shell hero-inner">
            <div className="hero-copy">
              <div data-hero-group="heading" style={{ opacity: "var(--hero-heading, 1)" }}>
                <h1 id="hero-title" className="type-display hero-title">
                  Invest. Earn. Harvest.
                </h1>
              </div>
              <div data-hero-group="copy" style={{ opacity: "var(--hero-copy, 1)" }}>
                <p className="type-lead hero-subline">{HERO_SUBLINE}</p>
              </div>
              <div data-hero-group="actions" style={{ opacity: "var(--hero-actions, 1)" }}>
                <HeroActions />
              </div>
            </div>
            <div
              data-hero-group="rail"
              className="hero-rail"
              style={{ opacity: "var(--hero-rail, 1)" }}
            >
              <ul className="hero-counters">
                {HERO_COUNTERS.map((counter) => (
                  <li key={counter.label} className="hero-counter">
                    <span className="type-figure hero-figure">
                      <Counter
                        value={counter.value}
                        decimals={counter.decimals}
                        prefix={counter.prefix}
                        suffix={counter.suffix}
                        finalText={counter.finalText}
                        startAfterMs={1040}
                      />
                    </span>
                    <span className="type-label hero-counter-label">{counter.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </HeroMotion>
  );
}
