/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { fileURLToPath } from "node:url";

import "./src/env.js";

// Privy's fiat onramp is never used; see src/stubs/stripe-crypto.js.
const STRIPE_CRYPTO_STUB = "./src/stubs/stripe-crypto.js";

/** @type {import("next").NextConfig} */
const config = {
  turbopack: {
    resolveAlias: { "@stripe/crypto": STRIPE_CRYPTO_STUB },
  },
  webpack(webpackConfig) {
    webpackConfig.resolve.alias["@stripe/crypto"] = fileURLToPath(
      new URL(STRIPE_CRYPTO_STUB, import.meta.url),
    );
    return webpackConfig;
  },
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
      { source: "/webhooks/:provider", destination: "/api/v1/webhooks/:provider" },
    ];
  },
};

export default config;
