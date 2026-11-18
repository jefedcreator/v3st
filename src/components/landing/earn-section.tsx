import { EARN_CARDS } from "./content";
import { LogoBadge } from "./logo-badge";

const EARN_BADGE_TICKERS = [
  { ticker: "AAPL", logoPath: "/stocks/aapl.svg" },
  { ticker: "NVDA", logoPath: "/stocks/nvda.svg" },
  { ticker: "TSLA", logoPath: "/stocks/tsla.svg" },
  { ticker: "AMZN", logoPath: "/stocks/amzn.svg" },
] as const;

// The vault grid: heading and lead on the left, a 2x2 card grid on the right
// (one column below 640px). Every card leads with a real rule figure, never an
// APR. The story link carries data-cursor-label for the cursor follower.
export function EarnSection(): React.JSX.Element {
  return (
    <section id="earn" className="landing-section earn-section">
      <div className="shell earn-grid">
        <div className="earn-copy">
          <h2 className="type-h2">Put your money to work.</h2>
          <p className="type-lead">
            Join an Earn pool for a stock you like and collect a share of the fees each time
            people trade it. It&apos;s optional and separate from buying shares.
          </p>
        </div>
        <ul className="earn-cards">
          {EARN_CARDS.map((card, index) => (
            <li key={card.title} className="earn-card">
              {index === 0 ? (
                <span className="earn-badges" aria-hidden="true">
                  {EARN_BADGE_TICKERS.map((badge) => (
                    <LogoBadge
                      key={badge.ticker}
                      ticker={badge.ticker}
                      logoPath={badge.logoPath}
                      size={32}
                    />
                  ))}
                </span>
              ) : null}
              <span className="type-figure earn-figure">{card.figure}</span>
              <span className="type-label earn-card-label">{card.label}</span>
              <h3 className="earn-card-title">{card.title}</h3>
              <p className="earn-card-body">{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="shell earn-after">
        <p className="earn-risk">
          Fees aren&apos;t guaranteed and quiet weeks can earn nothing. You can get back less
          than you put in if the price moves a lot. In the beta, fees come mostly from test
          trading and have no real value.
        </p>
        <a href="#join" data-cursor-label="Join" className="earn-story-link">
          Join the waitlist to try Earn
        </a>
      </div>
    </section>
  );
}
