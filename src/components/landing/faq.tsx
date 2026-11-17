import { Plus } from "@phosphor-icons/react/dist/ssr";
const items = [
  [
    "Can I invest real money in this beta?",
    "No. This is an illustrative preview with fictional assets and independent examples. No account, real bank transfer, identity submission or investment is available on this page. Integrations are simulated.",
  ],
  [
    "Do I own the underlying company shares?",
    "Tokenized stock exposure is not a promise of direct legal ownership of underlying company shares. Rights depend on the instrument and issuer. Do not assume voting rights, direct redemption or guaranteed dividends.",
  ],
  [
    "Where could income come from?",
    "A separately chosen strategy can receive liquidity fees or source-specific rewards when its conditions are met. Holding a stock or idle cash does not automatically generate income. Strategy returns can be zero. Unconverted stock rewards are not yet payable; they need an authorized conversion and confirmed proceeds.",
  ],
  [
    "Could I lose money?",
    "Yes. Stock and FX valuations can fall, and strategies can lose principal. Valuation is not cash. Sale or exit proceeds may include returned principal and can be less than your starting amount. The loss example shows zero income separately from the principal loss.",
  ],
  [
    "Are these the fees I would pay?",
    "All fees and exchange rates shown here are illustrative beta settings, not provider quotations, commercial prices or recommendations. An actual confirmation would need its own current rate, exact costs and authorization.",
  ],
  [
    "How would withdrawals work?",
    "The intended experience reviews eligible confirmed proceeds, a verified bank destination and the full fee breakdown before a payout. Reinvestment needs separate authorization and may have its own costs. No withdrawal or reinvestment happens in this demo.",
  ],
  [
    "What happens below the Friday minimum?",
    "In the example policy, the ₦2,000 gross minimum is checked before the payout fee. ₦1,999.99 rolls over with no fee charged; exactly ₦2,000 qualifies before the example ₦100 fee. Friday processing is 08:00–23:00 Africa/Lagos, not an arrival guarantee or an income promise.",
  ],
] as const;
export function Faq() {
  return (
    <section
      id="faq"
      className="section shell faq-section"
      aria-labelledby="faq-title"
    >
      <div>
        <h2 id="faq-title" className="section-title">
          A few things
          <br />
          worth understanding.
        </h2>
        <p className="section-copy">
          Take the time you need.
          <br />
          The details matter.
        </p>
      </div>
      <div className="faq-list">
        {items.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Plus aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
