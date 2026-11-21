# V3ST

V3ST is a Nigerian-first beta for understanding naira funding, fractional tokenized stock exposure, optional income strategies, and eligible proceeds. It targets retail investing newcomers who need costs, rights, risks and access explained before an account decision.

The public landing page speaks to Nigerian first-time investors; Base Stocks Maxxing judges see it as a customer would.

Its action is **Join the waitlist**: an email sign-up that the backend stores and rate-limits. Nothing is ever emailed automatically; the operator invites people in groups by adding them to the beta allowlist.

The page shows the beta's own prices in naira, labelled as beta prices, and keeps crypto vocabulary out of its copy.

Every external integration in the wider application remains verified test/sandbox or simulated. Paycrest is simulated-only. Five of the six stock providers are local stand-ins, while Hydrex runs its real contracts on Base Sepolia.

Tokenized stock exposure is not a promise of direct legal ownership, voting rights or guaranteed dividends. Valuation is not cash. Holding stock or idle cash generates no automatic income. Separately chosen strategies can earn zero and lose principal; unconverted rewards are not payable. Sale proceeds may include returned principal.

Friday processing is 08:00–23:00 Africa/Lagos for eligible confirmed proceeds, subject to conversion, consent, gross minimum and costs. It promises neither income every Friday nor bank arrival time. Beta rates and fees are test settings, never commercial quotes or recommendations.

The approved brand (2026-11-17) is dark:

- a green-tinted near-black ground;
- flag green `#00804D` as the one signal colour;
- Archivo throughout, which carries the naira sign. It replaced Bricolage Grotesque on 2026-11-20 because the sibling product Sara uses Bricolage;
- the [grain mark](docs/brand/v3st-grain.svg) beside the name *V3ST* as the product logo;
- katana.network's measured scroll and motion behaviour, with accessible fallbacks.

The "Built to work with" row shows official marks of the 12 services V3ST is built around. It asserts no partnership or endorsement, and says that most of those services are in test mode or simulated.

The landing assignment adds a waitlist route, a read-only public ticker and a quiet Sign in link in the header and footer that leads to `/signin`. It includes no deployment, no change to financial behaviour and no live activation.

Beyond the landing, V3ST now has a beta customer app: invited testers sign in at `/signin`, finish setup (identity test card, PIN, documents, bank account), and use the phone-first pages the API serves — home as one live money line, stocks with buying and selling, cash with add money and withdraw, Earn, earnings, activity receipts and settings. Everything runs on test money; every job the API supports is reachable from a 390px phone.
