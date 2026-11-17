"use client";
import { ArrowsSplit } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn } from "./demo-money";
export type StrategyScenario = "eligible" | "zero_income" | "principal_loss";
export function DemoStrategies({
  opened,
  scenario,
  onOpen,
  onScenario,
}: {
  opened: boolean;
  scenario: StrategyScenario;
  onOpen: () => void;
  onScenario: (value: StrategyScenario) => void;
}) {
  const f = landingDemoFixture.strategy;
  return (
    <div className="demo-chapter">
      <div className="demo-explainer">
        <h3>Income needs a separate decision.</h3>
        <p>
          A hypothetical liquidity strategy may receive trading fees. It can
          also produce no income and lose principal. Simply holding stock or
          idle cash earns no automatic income.
        </p>
        {!opened ? (
          <Button onClick={onOpen}>Open strategy example</Button>
        ) : (
          <div className="choice-row" aria-label="Strategy scenarios">
            {(
              [
                ["eligible", "Eligible proceeds"],
                ["zero_income", "Zero income"],
                ["principal_loss", "Principal loss"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={scenario === value ? "default" : "outline"}
                aria-pressed={scenario === value}
                onClick={() => onScenario(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        <p className="demo-caution">
          Opening an example is a demo selection only, not an investment
          authorization. Unconverted stock rewards are not yet payable.
        </p>
      </div>
      <div className="demo-result">
        <span className="result-icon">
          <ArrowsSplit aria-hidden="true" />
        </span>
        {!opened ? (
          <>
            <h4 className="demo-empty-title">No strategy selected</h4>
            <p className="result-footnote">
              Explore the mechanism and scenarios only if you choose. Opening
              this chapter has changed no selection.
            </p>
          </>
        ) : (
          <>
            <span className="result-label">
              {scenario === "principal_loss"
                ? "Illustrative principal change"
                : "Eligible confirmed income"}
            </span>
            <strong className="result-amount financial">
              {formatNgn(
                scenario === "eligible"
                  ? f.eligibleIncomeKobo
                  : scenario === "principal_loss"
                    ? f.lossKobo
                    : "0",
              )}
            </strong>
            {scenario === "principal_loss" ? (
              <dl className="money-list">
                <div>
                  <dt>Illustrative starting principal</dt>
                  <dd>{formatNgn(f.initialPrincipalKobo)}</dd>
                </div>
                <div>
                  <dt>Returned principal</dt>
                  <dd>{formatNgn(f.lossExitKobo)}</dd>
                </div>
                <div>
                  <dt>Income</dt>
                  <dd>{formatNgn("0")}</dd>
                </div>
              </dl>
            ) : (
              <p className="result-footnote">
                {scenario === "eligible"
                  ? "This independent example assumes eligible, confirmed proceeds. It is not a forecast or a return on the funding example."
                  : "No eligible income in this scenario. A strategy does not guarantee returns."}
              </p>
            )}
            <p className="result-footnote">
              Returned principal is separate from income. This is a simulated
              mechanism, not an available provider product.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
