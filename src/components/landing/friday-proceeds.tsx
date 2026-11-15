export function FridayProceeds() {
  return (
    <section
      id="friday"
      aria-labelledby="friday-heading"
      className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
    >
      <h2
        id="friday-heading"
        className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
      >
        Friday proceeds, paid from confirmed income only
      </h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="border-t-2 border-rule pt-4">
          <h3 className="text-xl font-semibold text-ink">The schedule</h3>
          <p className="mt-2 text-ink-muted">
            <strong className="font-semibold text-ink">
              Friday processing: 08:00–23:00 Africa/Lagos.
            </strong>{" "}
            That is a processing window, not a promise of arrival — and not a
            promise of income every Friday. Income exists only as receipt-backed
            confirmed source proceeds.
          </p>
        </div>
        <div className="border-t-2 border-rule pt-4">
          <h3 className="text-xl font-semibold text-ink">
            Gross minimum and rollover
          </h3>
          <p className="mt-2 text-ink-muted">
            Payouts require a gross minimum — ₦2,000 in this beta. Below the
            minimum, proceeds roll over to the next Friday and no fee is
            charged. At or above it, the payout qualifies before fees; the
            example fee is then deducted.
          </p>
        </div>
        <div className="border-t-2 border-rule pt-4">
          <h3 className="text-xl font-semibold text-ink">Payout or reinvest</h3>
          <p className="mt-2 text-ink-muted">
            You choose once: pay out to your own verified Nigerian bank account,
            or reinvest eligible confirmed proceeds. Reinvestment is a separate
            authorization with its own possible costs — the bank-payout fee is
            not silently applied to it.
          </p>
        </div>
        <div className="border-t-2 border-rule pt-4">
          <h3 className="text-xl font-semibold text-ink">Zero income is possible</h3>
          <p className="mt-2 text-ink-muted">
            A strategy can produce zero income, and it can lose principal. Some
            rewards also require conversion before they are payable at all.
            Holding stock or idle cash pays nothing automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
