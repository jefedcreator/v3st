import { BUILT_WITH } from "./brand-catalogue";
import { BrandMark } from "./brand-mark";

// The "Trusted by" row: one small centred label as the section's heading, then
// the wrapped marks. The caption keeps the no-endorsement line true.
export function BuiltWith(): React.JSX.Element {
  return (
    <section id="built-with" className="landing-section built-with">
      <div className="shell">
        <h2 className="type-label built-with-label">Built to work with</h2>
        <ul className="built-with-row">
          {BUILT_WITH.map((brand) => (
            <li key={brand.id}>
              <BrandMark brand={brand} />
            </li>
          ))}
        </ul>
        <p className="built-with-caption">
          In the beta no real money moves, and most of these services are in test mode or
          simulated by V3ST. Names and logos identify the services V3ST is built to work with;
          they don&apos;t imply partnership or endorsement.
        </p>
      </div>
    </section>
  );
}
