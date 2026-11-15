"use client";
import { ArrowUpRight, Bank } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn, payoutPreview } from "./demo-money";
export type ProceedsScenario = "eligible" | "below_minimum" | "at_minimum";
export function DemoProceeds({
  scenario,
  preference,
  onScenario,
  onPreference,
}: {
  scenario: ProceedsScenario;
  preference: "payout" | "reinvest";
  onScenario: (value: ProceedsScenario) => void;
  onPreference: (value: "payout" | "reinvest") => void;
}) {
  const f = landingDemoFixture.proceeds;
  const gross =
    scenario === "below_minimum"
      ? f.belowMinimumGrossKobo
      : scenario === "at_minimum"
        ? f.atMinimumGrossKobo
        : f.qualifyingGrossKobo;
  const preview = payoutPreview(gross);
  return (
    <div className="demo-chapter">
      <div className="demo-explainer">
        <h3>Follow the eligible proceeds.</h3>
        <p>
          Compare the illustrative gross minimum and bank payout fee, or read
          how reinvestment differs.
        </p>
        <div className="choice-row" aria-label="Proceeds preference">
          {(["payout", "reinvest"] as const).map((value) => (
            <Button
              key={value}
              variant={preference === value ? "default" : "outline"}
              aria-pressed={preference === value}
              onClick={() => onPreference(value)}
            >
              {value === "payout" ? "Payout" : "Reinvest"}
            </Button>
          ))}
        </div>
        <div className="choice-row" aria-label="Proceeds scenarios">
          {(
            [
              ["eligible", "Qualifying"],
              ["below_minimum", "Below minimum"],
              ["at_minimum", "At minimum"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={scenario === value ? "secondary" : "outline"}
              aria-pressed={scenario === value}
              onClick={() => onScenario(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="demo-caution">
          Friday processing: 08:00–23:00 Africa/Lagos. A processing window, not
          an arrival or income guarantee.
        </p>
      </div>
      <div className="demo-result">
        <span className="result-icon">
          {preference === "payout" ? (
            <Bank aria-hidden="true" />
          ) : (
            <ArrowUpRight aria-hidden="true" />
          )}
        </span>
        {preference === "reinvest" ? (
          <>
            <span className="result-label">Eligible proceeds under review</span>
            <strong className="result-amount financial">
              {formatNgn(gross)}
            </strong>
            <h4>Reinvestment comparison</h4>
            <p className="result-footnote">
              Reinvestment allocates eligible confirmed proceeds subject to
              separate authorization, the applicable minimum policy and
              investment costs. The example bank-payout fee is not applied to
              this comparison.
            </p>
            <p className="result-footnote">
              No reinvestment or selection is executed.
            </p>
          </>
        ) : (
          <>
            <span className="result-label">
              {preview.status === "rollover"
                ? "Rollover amount"
                : "Example received after fee"}
            </span>
            <strong className="result-amount financial">
              {formatNgn(
                preview.status === "rollover"
                  ? preview.rolloverKobo
                  : preview.receivedKobo,
              )}
            </strong>
            <dl className="money-list">
              <div>
                <dt>Eligible gross proceeds</dt>
                <dd>{formatNgn(preview.grossKobo)}</dd>
              </div>
              <div>
                <dt>Gross minimum, before fee</dt>
                <dd>{formatNgn(f.minimumGrossKobo)}</dd>
              </div>
              <div>
                <dt>
                  {preview.status === "rollover"
                    ? "Fee charged"
                    : "Illustrative bank payout fee"}
                </dt>
                <dd>{formatNgn(preview.feeKobo)}</dd>
              </div>
            </dl>
            {preview.status === "rollover" ? (
              <p className="result-footnote">
                Below minimum. Rolls over with no payout fee charged.
              </p>
            ) : (
              <>
                <p className="payout-equation financial">
                  {formatNgn(preview.grossKobo)} − {formatNgn(preview.feeKobo)}{" "}
                  = {formatNgn(preview.receivedKobo)}
                </p>
                <p className="masked-bank">Example bank · account •••• 1234</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
