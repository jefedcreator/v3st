import { FlowDiagram } from "./flow-diagram";
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="section how-section"
      aria-labelledby="how-title"
    >
      <div className="shell">
        <div className="center-heading">
          <h2 id="how-title" className="section-title">
            From naira to
            <br />
            understanding.
          </h2>
          <p className="section-copy">
            Follow the journey. Make each decision with the details in view.
          </p>
        </div>
        <div className="how-grid">
          <FlowDiagram />
          <ol className="walkthrough">
            {[
              [
                "Fund with naira",
                "Review the funding amount, illustrative fee and rate. The beta uses test examples only.",
              ],
              [
                "Inspect fractional exposure",
                "Look at the quantity, rights, reference value and costs. Stock exposure can lose value.",
              ],
              [
                "Choose a strategy separately",
                "Optional strategies require their own decision. Holding stock or idle cash does not automatically generate income.",
              ],
              [
                "Review eligible proceeds",
                "Only confirmed, converted proceeds can be considered for payout or reinvestment. Principal and income stay separate.",
              ],
            ].map(([title, body], index) => (
              <li key={title}>
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
