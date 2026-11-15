const FAQS = [
  {
    q: "Is V3ST available now?",
    a: "V3ST is in beta. Everything you see here uses test funds and simulated providers — no real money moves, no live providers are connected, and the page is not indexed publicly. An illustrative preview needs no account.",
  },
  {
    q: "Is tokenized exposure the same as owning the underlying shares?",
    a: "No. Tokenized stock exposure is exposure to a tokenized instrument, not direct legal ownership of the underlying company's shares. It does not carry voting rights or a promise of dividends.",
  },
  {
    q: "Where does income come from?",
    a: "Only from finalized, receipt-backed source proceeds — for example a confirmed reward that was converted to the payout asset. Holding stock or idle cash never earns automatically, and corporate-action changes affect valuation only.",
  },
  {
    q: "Can I lose money?",
    a: "Yes. Values can rise or fall, a strategy can return zero income, and a strategy can also lose principal. Rewards may require conversion before they are payable. Valuation shown is not cash, and sale proceeds can include returned principal alongside any gain or loss.",
  },
  {
    q: "What are the example fees?",
    a: "In the beta demo, an example ₦100,000 deposit shows a ₦1,000 fee, leaving ₦99,000 available, and an example qualifying ₦5,000 payout shows a ₦100 fee, receiving ₦4,900. These are illustrative beta settings, not a provider quotation or a recommendation.",
  },
  {
    q: "How do withdrawals and payouts work?",
    a: "Proceeds that clear the gross minimum are paid by bank transfer to your own verified Nigerian bank account during the Friday processing window (08:00–23:00 Africa/Lagos), or reinvested if you chose that. The window is processing time, not a promise of arrival or of income every Friday.",
  },
  {
    q: "What happens to earnings below the minimum?",
    a: "They roll over to the next Friday and stay visible as pending. No fee is charged while they are below the ₦2,000 gross minimum.",
  },
] as const;

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
    >
      <h2
        id="faq-heading"
        className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
      >
        FAQs
      </h2>
      <div className="mt-10 divide-y divide-rule border-y border-rule">
        {FAQS.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-rule text-primary transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
