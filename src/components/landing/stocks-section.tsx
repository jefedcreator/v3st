import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

import type { PublicTickerDto } from "@/types/landing";

import { STOCKS_BODY } from "./content";
import { formatPriceCaption } from "./format";
import { PriceTicker } from "./price-ticker";
import { TickerRow } from "./ticker-row";

// The "Trade the market" split: copy on the left, the vertical beta ticker on
// the right. Rows come from the server-formatted read; with no prices a row
// shows logo, ticker, sector and name only.
export function StocksSection(props: { ticker: PublicTickerDto }): React.JSX.Element {
  return (
    <section id="stocks" className="landing-section stocks-section">
      <div className="shell stocks-grid">
        <div className="stocks-copy">
          <h2 className="type-h2">Invest in companies you already know.</h2>
          <p className="type-lead stocks-body">{STOCKS_BODY}</p>
          <a className="story-link" href="#join">
            Join the waitlist <ArrowRight size={18} weight="regular" aria-hidden="true" />
          </a>
        </div>
        <div className="stocks-ticker">
          <PriceTicker rowCount={props.ticker.rows.length}>
            {props.ticker.rows.map((row) => (
              <TickerRow key={row.ticker} row={row} />
            ))}
          </PriceTicker>
          <p className="ticker-caption">
            {formatPriceCaption(props.ticker.as_of, new Date())}
          </p>
        </div>
      </div>
    </section>
  );
}
