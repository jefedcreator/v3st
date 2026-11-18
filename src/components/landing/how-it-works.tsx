import {
  ArrowUDownLeft,
  Bank,
  CalendarCheck,
  ChartLineUp,
  Plant,
} from "@phosphor-icons/react/dist/ssr";

import { JOURNEY_STAGES } from "./content";
import { BeamParallax, JourneyDiagram } from "./journey-diagram";

const STAGE_ICONS = {
  Bank,
  ChartLineUp,
  Plant,
  CalendarCheck,
  ArrowUDownLeft,
} as const;

// The centred "How it works" section. The ordered list is the authoritative
// content; the diagram and the light beam are aria-hidden decoration, and the
// beam is the only parallax target.
export function HowItWorks(): React.JSX.Element {
  return (
    <section id="how-it-works" className="landing-section how-it-works">
      <BeamParallax className="how-beam" aria-hidden="true">
        <picture>
          <source srcSet="/art/light-beam.avif" type="image/avif" />
          <source srcSet="/art/light-beam.webp" type="image/webp" />
          <img
            src="/art/light-beam.webp"
            alt=""
            width={1600}
            height={900}
            loading="lazy"
            decoding="async"
          />
        </picture>
      </BeamParallax>
      <div className="shell how-inner">
        <h2 className="type-h2 how-heading">How V3ST works.</h2>
        <p className="type-lead how-lead">
          Your naira goes in by bank transfer and comes back the same way. Everything in between
          is handled for you.
        </p>
        <div className="how-diagram">
          <JourneyDiagram stages={JOURNEY_STAGES} />
        </div>
        <ol className="journey-list">
          {JOURNEY_STAGES.map((stage) => {
            const Icon = STAGE_ICONS[stage.icon];
            return (
              <li key={stage.title} className="journey-stage">
                <span className="journey-icon" aria-hidden="true">
                  <Icon size={28} weight="regular" />
                </span>
                <h3 className="journey-title">{stage.title}</h3>
                <p className="journey-caption">{stage.caption}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
