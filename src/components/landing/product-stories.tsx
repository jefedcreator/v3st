import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { MarketTicker, type TickerRow } from "./market-ticker";
import { StoryCursor } from "./story-cursor";

const TICKER_ROWS: readonly TickerRow[] = [
  {
    id: "tsta",
    title: "TSTA · Test Stock A",
    detail: "Fictional fractional stock used in the demo",
  },
  {
    id: "tstb",
    title: "TSTB · Test Stock B",
    detail: "Fictional fractional stock used in the demo",
  },
  {
    id: "ngn-funding",
    title: "Naira funding",
    detail: "Bank transfer in ₦ — simulated ramp in this beta",
  },
  {
    id: "usdc-settlement",
    title: "USDC settlement context",
    detail: "Settlement concept; the local test token is not issuer-backed USDC",
    logoSrc: "/brands/usdc-token.svg",
  },
  {
    id: "base-target",
    title: "Base target context",
    detail: "Documented target network; beta execution runs on local chain 31337",
    logoSrc: "/brands/base-square.svg",
  },
  {
    id: "solana-architecture",
    title: "Solana architecture context",
    detail: "Documented architecture; existing records are simulations only",
    logoSrc: "/brands/solana-mark.svg",
  },
];

export function ProductStories() {
  return (
    <>
      <section
        id="explore"
        aria-labelledby="explore-heading"
        className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
      >
        <div className="grid items-center gap-10 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="min-w-0">
            <h2
              id="explore-heading"
              className="text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
            >
              Fractional tokenized stock exposure, from naira
            </h2>
            <p className="mt-4 text-lg text-ink-muted">
              Fund with naira and see fractional exposure to tokenized stocks.
              Tokenized exposure is not direct legal ownership of the
              underlying company&apos;s shares, and it promises no dividends.
            </p>
            <p className="mt-3 text-sm font-medium text-ink-muted">
              Illustrative examples · not live prices
            </p>
            <a
              href="#demo"
              data-story-link
              className="mt-6 inline-flex items-center gap-2 text-lg font-semibold text-primary underline-offset-4 hover:underline"
            >
              Explore a demo
              <ArrowRight className="size-5" weight="bold" />
            </a>
          </div>
          <MarketTicker rows={TICKER_ROWS} />
        </div>
      </section>

      <section
        aria-labelledby="costs-heading"
        className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
      >
        <div className="grid items-center gap-10 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="order-2 min-w-0 lg:order-1">
            <div className="rounded-2xl border border-rule bg-surface p-6">
              <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">
                Fees before confirmation
              </h3>
              <dl className="mt-4 divide-y divide-rule">
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Example deposit</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">₦100,000</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Example fee (illustrative beta setting)</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">₦1,000</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Available in the example</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">₦99,000</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-ink-muted">
                Illustrative beta settings, not a provider quotation or a
                recommendation.
              </p>
            </div>
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <h2
              id="costs-heading"
              className="text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
            >
              Understand the fees before anything is confirmed
            </h2>
            <p className="mt-4 text-lg text-ink-muted">
              Every quote shows the exact amount, the rate and every fee
              before confirmation. Nothing is charged that was not shown.
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="no-wallet-heading"
        className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
      >
        <div className="grid items-center gap-10 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="min-w-0">
            <h2
              id="no-wallet-heading"
              className="text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
            >
              No wallet-connect, seed phrase or gas top-up
            </h2>
            <p className="mt-4 text-lg text-ink-muted">
              Accounts, signing and network fees are handled by V3ST in this
              beta. The intended journey never asks you to connect a wallet,
              reveal a seed phrase or top up gas.
            </p>
            <p className="mt-3 text-ink-muted">
              Everything on this page is simulated beta: test funds only, no
              live providers, and values can rise or fall. Nothing here is
              guaranteed.
            </p>
          </div>
          <div className="rounded-2xl border border-rule bg-sage p-6">
            <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">
              What fractional exposure means here
            </h3>
            <p className="mt-3 text-ink-muted">
              A small naira amount can correspond to a fraction of a tokenized
              stock. The displayed value is a reference valuation at a point
              in time — it is not cash, and selling can return more or less
              than you put in, including returned principal.
            </p>
          </div>
        </div>
      </section>
      <StoryCursor />
    </>
  );
}
