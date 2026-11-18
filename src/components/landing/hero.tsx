import { HERO_COUNTERS, HERO_SUBLINE } from "./content";
import { WaitlistForm } from "./waitlist-form";

// The hero. The DOM contract (data-hero-track, data-hero-group, data-figure)
// is what the choreography animates: each group's opacity is driven by
// --hero-<group>, which defaults to 1 so the page reads cleanly without
// JavaScript motion. The static glow is also the fluid background's fallback.
export function Hero(): React.JSX.Element {
  return (
    <div data-hero-track className="hero-track">
      <section id="top" aria-labelledby="hero-title" className="hero">
        <div
          data-hero-group="background"
          className="hero-background"
          style={{ opacity: "var(--hero-background, 1)" }}
          aria-hidden="true"
        >
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
            />
          </picture>
        </div>
        <div className="shell hero-inner">
          <div data-hero-group="heading" style={{ opacity: "var(--hero-heading, 1)" }}>
            <h1 id="hero-title" className="type-display hero-title">
              Invest. Earn. Harvest.
            </h1>
          </div>
          <div data-hero-group="copy" style={{ opacity: "var(--hero-copy, 1)" }}>
            <p className="type-lead hero-subline">{HERO_SUBLINE}</p>
          </div>
          <div data-hero-group="actions" style={{ opacity: "var(--hero-actions, 1)" }}>
            <WaitlistForm source="hero" inputId="hero-email" />
          </div>
          <div
            data-hero-group="rail"
            className="hero-rail"
            style={{ opacity: "var(--hero-rail, 1)" }}
          >
            <ul className="hero-counters">
              {HERO_COUNTERS.map((counter) => (
                <li key={counter.label} className="hero-counter">
                  <span data-figure className="type-figure hero-figure">
                    {counter.finalText}
                  </span>
                  <span className="type-label hero-counter-label">{counter.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
