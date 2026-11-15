import { Bank, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn, formatUnits } from "./demo-money";
export function DemoFunding() {
  const f = landingDemoFixture.funding;
  return (
    <div className="demo-chapter">
      <div className="demo-explainer">
        <h3>Start with the breakdown.</h3>
        <p>
          This example adds naira and separates the illustrative funding fee
          before showing the available amount.
        </p>
        <p className="demo-caution">
          Example rate and fees are illustrative beta settings. They are not a
          provider quotation or recommendation.
        </p>
      </div>
      <div className="demo-result">
        <span className="result-icon">
          <Bank aria-hidden="true" />
        </span>
        <span className="result-label">Example gross funding</span>
        <strong className="result-amount financial">
          {formatNgn(f.grossKobo)}
        </strong>
        <dl className="money-list">
          <div>
            <dt>Illustrative funding fee</dt>
            <dd>{formatNgn(f.feeKobo)}</dd>
          </div>
          <div>
            <dt>Available in this example</dt>
            <dd>{formatNgn(f.availableKobo)}</dd>
          </div>
          <div>
            <dt>Example rate per USD</dt>
            <dd>{formatNgn(f.rateKoboPerUsd)}</dd>
          </div>
        </dl>
        <div className="settlement-detail">
          <ArrowRight aria-hidden="true" />
          <p>
            <strong>{formatUnits(f.settlementMicro, 6)}.000000</strong>{" "}
            USDC-equivalent settlement units.
            <br />
            Illustrative test units, not a transferable balance.
          </p>
        </div>
      </div>
    </div>
  );
}
