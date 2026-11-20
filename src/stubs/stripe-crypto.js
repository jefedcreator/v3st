// Stands in for `@stripe/crypto`, which `@privy-io/react-auth` lazy-loads only
// for its fiat onramp screen. The customer app's Privy sign-in is email-only
// with embedded wallets off, so that screen never opens, and this stub spares
// the app Stripe's optional `@stripe/stripe-js` peer (the plan allows exactly
// three new runtime packages). If the onramp were ever called, it would fail
// loudly rather than load a payment SDK.
export function loadStripeOnramp() {
  throw new Error("The fiat onramp is not part of the V3ST beta.");
}
