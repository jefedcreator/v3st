import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
import { MarketTicker } from "./market-ticker";
import { StoryCursor } from "./story-cursor";
const rows = [
  { id: "TSTA", title: "Test Stock A", detail: "Fictional stock exposure" },
  { id: "TSTB", title: "Test Stock B", detail: "Fictional stock exposure" },
  {
    id: "NGN",
    title: "Start in naira",
    detail: "Illustrative funding context",
  },
  {
    id: "USDC",
    title: "USDC",
    detail: "Settlement concept; test units",
    logoSrc: "/brands/usdc.svg",
  },
  {
    id: "BASE",
    title: "Base",
    detail: "Documented target; beta is local",
    logoSrc: "/brands/base.svg",
  },
  {
    id: "SOL",
    title: "Solana",
    detail: "Architecture context; simulated",
    logoSrc: "/brands/solana.svg",
  },
] as const;
export function ExploreStory() {
  return (
    <section
      id="explore"
      className="section shell story-split"
      aria-labelledby="explore-title"
    >
      <div className="story-copy">
        <h2 id="explore-title" className="section-title">
          A smaller piece.
          <br />A clearer starting point.
        </h2>
        <p className="section-copy">
          You don’t need a whole unit to understand an investment. Explore
          fractional tokenized stock exposure, with the quantity and its
          reference value in view.
        </p>
        <p className="story-disclosure">
          Tokenized exposure carries its own rights and risks. It is not a
          promise of direct ownership of company shares.
        </p>
        <Button asChild variant="outline">
          <a href="#demo">
            Explore the stock examples <ArrowRight aria-hidden="true" />
          </a>
        </Button>
      </div>
      <MarketTicker rows={rows} />
    </section>
  );
}
export function ProductStories() {
  return (
    <>
      <section
        className="section shell story-split story-reverse"
        aria-labelledby="quantity-title"
      >
        <div
          className="quantity-art"
          aria-label="Independent illustrative quantity example: 0.25 units at 40,000 naira per unit has a reference value of 10,000 naira"
        >
          <div className="quantity-fraction" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="quantity-figure financial">
            0.25 <span>units</span>
          </div>
          <p>
            Test Stock A <span>Fictional</span>
          </p>
          <div className="quantity-equation financial">
            ₦40,000 / unit <span>× 0.25</span>
            <strong>₦10,000 reference value</strong>
          </div>
          <small>Independent illustrative example</small>
        </div>
        <div className="story-copy">
          <h2 id="quantity-title" className="section-title">
            Know what
            <br />
            your number means.
          </h2>
          <p className="section-copy">
            A fraction tells you the quantity. A reference price helps explain
            its estimated value. Neither tells you what a sale will settle for.
          </p>
          <p className="story-disclosure">
            Valuation can rise or fall. Appreciation is not payable cash, and a
            sale can return less than your starting principal.
          </p>
        </div>
      </section>
      <section
        className="section shell story-split"
        aria-labelledby="fees-title"
      >
        <div className="story-copy">
          <h2 id="fees-title" className="section-title">
            The details.
            <br />
            Before the decision.
          </h2>
          <p className="section-copy">
            See the example amount, rate and fees together. The intended
            experience handles the blockchain steps in the background.
          </p>
          <ul className="plain-checks">
            {[
              "Understand the quantity and costs",
              "No wallet-connect or seed-phrase step",
              "No gas top-up in the intended journey",
            ].map((text) => (
              <li key={text}>
                <Check aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          <p className="story-disclosure">
            This beta is simulated. The examples are not live quotes, and no
            real investment is available here.
          </p>
        </div>
        <StoryCursor>
          <a href="#demo" className="fee-story-link">
            <span className="fee-story-title">
              A little more clarity
              <br />
              at every step.
            </span>
            <span className="fee-breakdown">
              <span>
                Example funding<span className="financial">₦100,000</span>
              </span>
              <span>
                Illustrative fee<span className="financial">₦1,000</span>
              </span>
              <strong>
                Available in this example
                <span className="financial">₦99,000</span>
              </strong>
            </span>
            <span className="fee-story-cta">
              Try the independent examples <ArrowRight aria-hidden="true" />
            </span>
          </a>
        </StoryCursor>
      </section>
    </>
  );
}
