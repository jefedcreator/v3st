import { FlowDiagram } from "./flow-diagram";

const STEPS = [
  {
    title: "Fund with naira",
    body: "Start from a Nigerian bank transfer in naira. In this beta the ramp is simulated, so the account details are test details and no real money moves.",
  },
  {
    title: "Inspect fractional exposure and costs",
    body: "See fractional tokenized stock quantities, the reference valuation and every fee before anything is confirmed. Valuation is not cash.",
  },
  {
    title: "Separately choose a strategy",
    body: "Income strategies are optional and explicit. Holding stock or idle cash never earns automatically, and a strategy can also lose principal.",
  },
  {
    title: "Review eligible proceeds",
    body: "Only receipt-backed confirmed income becomes proceeds. On Fridays, qualifying proceeds are paid out to your own verified bank account or reinvested; smaller amounts roll over.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="mx-auto max-w-[1200px] px-6 py-14 md:py-28">
      <h2
        id="how-it-works-heading"
        className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
      >
        How it works
      </h2>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        Four steps, in order. The walkthrough below is readable without the
        animated diagram, and without JavaScript entirely.
      </p>
      <ol className="mt-10 grid gap-6 md:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t-2 border-rule pt-4">
            <span className="text-sm font-semibold text-primary">
              Step {index + 1}
            </span>
            <h3 className="mt-1 text-xl font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-ink-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <FlowDiagram />
      </div>
    </section>
  );
}
