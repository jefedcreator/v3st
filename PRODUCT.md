# V3ST product truth

V3ST is a Nigerian-first beta product for exploring naira-funded, fractional
tokenized stock exposure, optional income strategies, and eligible proceeds paid
to a Nigerian bank account. The whole application is beta: test funds only, every
provider runs against a verified sandbox or a local simulation, and no mainnet,
real funds, real identity submissions or live providers are involved.
`NODE_ENV=production` never enables live integrations.

## Narrative

Naira funding → fractional tokenized stock exposure → separately chosen income
strategies → eligible confirmed proceeds paid out or reinvested.

Holding stock or idle cash does not generate automatic income. Income exists only
as finalized, receipt-backed source proceeds (for example a confirmed reward that
was converted to the payout asset). Tokenized exposure is not direct legal
ownership of underlying company shares and promises no dividends.

## Audience and surfaces

- Primary visitor: a Nigerian retail investing newcomer who wants to understand
  funding, fractional exposure, costs, risks and access to proceeds before
  creating an account.
- The public landing page `/` is a **Persuade** surface; its embedded demo is an
  **Operate** surface. The primary action is **Explore a demo**. No signup,
  waitlist, identity submission or real transaction belongs on `/`.

## Hard rules for copy

- Never promise safety, regulatory approval, custody protection, audits,
  guaranteed yields, commercial fees or instant settlement.
- Strategy returns can be zero; principal can fall; rewards may require
  conversion; valuation is not cash; sale proceeds can include returned principal.
- Brand marks identify the documented ecosystem; they do not prove integration,
  sponsorship or endorsement. Provider names in this beta are simulated.
- The landing page makes no API calls, no wallet creation, no session creation,
  no RPC and no third-party runtime requests. Its demo uses local fixture data
  only.
- Friday processing window is 08:00–23:00 Africa/Lagos — a processing window, not
  a promise of arrival or of income every Friday. Payouts require a gross minimum
  (200,000 kobo = ₦2,000 in the beta fixture); below it, proceeds roll over with
  no fee charged.

## Source of truth

- Product/technical design: [Design.md](Design.md)
- Landing surface brief: [docs/superpowers/specs/2026-11-15-v3st-landing-design.md](docs/superpowers/specs/2026-11-15-v3st-landing-design.md)
- Visual/component decisions: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- Backend contracts and beta policy: [docs/superpowers/plans/2026-11-13-v3st-naira-ramps-and-payouts.md](docs/superpowers/plans/2026-11-13-v3st-naira-ramps-and-payouts.md), [docs/superpowers/specs/2026-11-14-v3st-onchain-stocks-and-income-design.md](docs/superpowers/specs/2026-11-14-v3st-onchain-stocks-and-income-design.md), and the decisions under [docs/decisions/](docs/decisions/)
