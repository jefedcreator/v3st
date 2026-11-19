import { BUILT_WITH } from "./brand-catalogue";
import { BrandMark } from "./brand-mark";
import { LogoMarquee } from "./logo-marquee";

// The "Trusted by" row: one small centred label as the section's heading, then
// the marks (a wrapped grid from 768px up, a self-scrolling row below it). The
// caption keeps the no-endorsement line true.
export function BuiltWith(): React.JSX.Element {
  return (
    <section id="built-with" className="landing-section built-with">
      <div className="shell">
        <h2 className="type-label built-with-label">Built to work with</h2>
        <LogoMarquee brandCount={BUILT_WITH.length} label="Services V3ST is built to work with">
          {BUILT_WITH.map((brand) => (
            <li key={brand.id}>
              <BrandMark brand={brand} />
            </li>
          ))}
        </LogoMarquee>
        <p className="built-with-caption">
          In the beta no real money moves, and most of these services are in test mode or
          simulated by V3ST. Names and logos identify the services V3ST is built to work with;
          they don&apos;t imply partnership or endorsement.
        </p>
      </div>
    </section>
  );
}
