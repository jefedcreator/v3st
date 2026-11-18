export type DocumentSlug = "terms" | "risks" | "how-shares-are-held" | "earn-risks" | "privacy";

export type CustomerDocument = {
  slug: DocumentSlug;
  title: string;
  version: string;
  body: string;
};

const VERSION = "2026-11-17";
// The privacy document changed on its own date (waitlist note); only
// INVEST_DOCUMENTS are required at onboarding, so no tester re-accepts anything.
const PRIVACY_VERSION = "2026-11-18";

export const CUSTOMER_DOCUMENTS: Record<DocumentSlug, CustomerDocument> = {
  terms: {
    slug: "terms",
    title: "Terms of use",
    version: VERSION,
    body: `# Terms of use

V3ST is in beta. Everything in the app right now uses test money: no real naira moves, and the shares you see have no cash value.

By using the app during the beta you agree to:

- treat every balance, price and payment as a test;
- not rely on anything in the app for real money or real investment advice;
- let us change these terms as the beta evolves. We will show you the latest version and ask you to accept it again when it changes.
`,
  },
  risks: {
    slug: "risks",
    title: "Risks of investing",
    version: VERSION,
    body: `# Risks of investing

Investing in shares can lose money. The value of what you buy can go down as well as up, and returns are not guaranteed.

Prices move with the real companies behind them. Past performance is not a guide to what will happen in future, and in the beta every price is test data anyway.

Only add money you would be comfortable losing in a real investment, and never borrow to invest.
`,
  },
  "how-shares-are-held": {
    slug: "how-shares-are-held",
    title: "How your shares are held",
    version: VERSION,
    body: `# How your shares are held

When you buy through V3ST you receive test shares that track the price of the real company. The price you see follows the real share price, but these are not direct ownership of the company's shares: you have no voting rights and no right to dividends.

In this beta the shares are tokenized test entries with no value. You can sell them back in the app at the price shown at the time.
`,
  },
  "earn-risks": {
    slug: "earn-risks",
    title: "Earn risks",
    version: VERSION,
    body: `# Earn risks

When you add money to an Earn pool, your money is split into shares and cash and both go into the pool. You can get back less than you put in if the price moves a lot against you.

Fees are not guaranteed, and they are collected every week. Quiet weeks can earn nothing, and in this beta the fees come mostly from test trading and have no real value.

You can withdraw at any time and you get back shares and cash in whatever mix the pool holds then.
`,
  },
  privacy: {
    slug: "privacy",
    title: "Privacy",
    version: PRIVACY_VERSION,
    body: `# Privacy

We use your email address to sign you in and to tell you about your account. We use your bank account details to send withdrawals to the account you added.

If you join the waitlist, we use your email address only to invite you to the beta.

We do not store your phone number, and we do not sell your personal data to anyone. In the beta nothing is shared outside the app.
`,
  },
};

// The documents a customer must accept at their current version before adding
// money or investing.
export const INVEST_DOCUMENTS: readonly DocumentSlug[] = ["terms", "risks", "how-shares-are-held"];
