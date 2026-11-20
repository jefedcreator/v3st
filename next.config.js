/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { fileURLToPath } from "node:url";

import "./src/env.js";

// The beta uses Privy for email sign-in and PIN reset. Its optional Farcaster
// wallet and Stripe onramp integrations still need to resolve at build time.
const privyAliases = {
  "@farcaster/mini-app-solana": "./src/stubs/farcaster-mini-app-solana.js",
  "@stripe/crypto": "./src/stubs/stripe-crypto.js",
};

/** @type {import("next").NextConfig} */
const config = {
  experimental: {
    // Custom webpack aliases disable Next's default build worker. Restore it
    // so compilation memory is released before lint and type checks run.
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  turbopack: {
    resolveAlias: privyAliases,
  },
  webpack(webpackConfig) {
    for (const [name, path] of Object.entries(privyAliases)) {
      webpackConfig.resolve.alias[name] = fileURLToPath(
        new URL(path, import.meta.url),
      );
    }
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
