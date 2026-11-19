import { BUILT_WITH } from "./brand-catalogue";
import { BrandMark } from "./brand-mark";
import { Counter } from "./counter";
import { SAFEGUARD_STATS } from "./content";

const baseBrand = BUILT_WITH.find((brand) => brand.id === "base")!;

const SAFEGUARD_CARDS = [
  {
    title: "Every naira on one ledger",
    body: "Every deposit, trade and payout is recorded in a double-entry ledger and checked against our partners' records.",
  },
  {
    title: "Paid only once received",
    body: "Earnings count only after they've actually arrived. Anything not yet received is labelled as an estimate.",
  },
] as const;

// The "Proof" section: three counting stat cards with diagonal light streaks,
// then three cards, the last carrying the Base mark.
export function Safeguards(): React.JSX.Element {
  return (
    <section id="safeguards" className="landing-section safeguards">
      <div className="shell">
        <h2 className="type-h2">Built to show its work.</h2>
        <ul className="safeguard-stats">
          {SAFEGUARD_STATS.map((stat) => (
            <li key={stat.label} className="safeguard-stat">
              <div className="safeguard-streaks" aria-hidden="true">
                <picture>
                  <source srcSet="/art/safeguard-streaks.avif" type="image/avif" />
                  <source srcSet="/art/safeguard-streaks.webp" type="image/webp" />
                  <img
                    src="/art/safeguard-streaks.webp"
                    alt=""
                    width={1200}
                    height={800}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </div>
              <span className="type-figure safeguard-figure">
                <Counter
                  value={stat.value}
                  decimals={stat.decimals}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  finalText={stat.finalText}
                />
              </span>
              <span className="type-label safeguard-label">{stat.label}</span>
              {stat.line ? <p className="safeguard-line">{stat.line}</p> : null}
            </li>
          ))}
        </ul>
        <ul className="safeguard-cards">
          {SAFEGUARD_CARDS.map((card) => (
            <li key={card.title} className="safeguard-card">
              <h3 className="safeguard-card-title">{card.title}</h3>
              <p className="safeguard-card-body">{card.body}</p>
            </li>
          ))}
          <li className="safeguard-card">
            <h3 className="safeguard-card-title">Built on Base</h3>
            <span className="safeguard-base-mark">
              <BrandMark brand={baseBrand} />
            </span>
            <p className="safeguard-card-body">
              V3ST runs on Base, a network built by Coinbase.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
