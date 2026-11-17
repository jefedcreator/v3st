import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    APP_STAGE: z.literal("beta"),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    YELLOWCARD_MODE: z.enum(["sandbox", "simulated"]).default("simulated"),
    YELLOWCARD_API_KEY: z.string().optional(),
    YELLOWCARD_API_SECRET: z.string().optional(),
    SIMULATED_IDENTITY_SECRET: z.string().min(32),
    PAYCREST_SIM_WEBHOOK_SECRET: z.string().min(16).optional(),
    SENTRY_DSN: z.string().url().optional(),
    TESTNET_RPC_URL: z.string().url().optional(),
    TESTNET_CHAIN_ID: z.coerce.number().int().positive().default(31337),
    TESTNET_SIGNER_PRIVATE_KEY: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
    // Must be a fresh testnet-only relayer key, never the local test key and
    // never a key that has held mainnet funds.
    BASE_SEPOLIA_RELAYER_PRIVATE_KEY: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    // Customer sign-in provider. "sandbox" is a Privy development app whose
    // app ID and SPKI verification key are required below; "simulated" is a
    // local issuer used in CI and local development. No Privy app secret is
    // ever used: the backend verifies tokens offline only.
    PRIVY_MODE: z.enum(["sandbox", "simulated"]).default("simulated"),
    PRIVY_APP_ID: z.string().min(1).optional(),
    PRIVY_VERIFICATION_KEY: z.string().min(1).optional(),
    PRIVY_BETA_ALLOWLIST: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    APP_STAGE: process.env.APP_STAGE,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    YELLOWCARD_MODE: process.env.YELLOWCARD_MODE,
    YELLOWCARD_API_KEY: process.env.YELLOWCARD_API_KEY,
    YELLOWCARD_API_SECRET: process.env.YELLOWCARD_API_SECRET,
    SIMULATED_IDENTITY_SECRET: process.env.SIMULATED_IDENTITY_SECRET,
    PAYCREST_SIM_WEBHOOK_SECRET: process.env.PAYCREST_SIM_WEBHOOK_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    TESTNET_RPC_URL: process.env.TESTNET_RPC_URL,
    TESTNET_CHAIN_ID: process.env.TESTNET_CHAIN_ID,
    TESTNET_SIGNER_PRIVATE_KEY: process.env.TESTNET_SIGNER_PRIVATE_KEY,
    BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL,
    BASE_SEPOLIA_RELAYER_PRIVATE_KEY: process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY,
    PRIVY_MODE: process.env.PRIVY_MODE,
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_VERIFICATION_KEY: process.env.PRIVY_VERIFICATION_KEY,
    PRIVY_BETA_ALLOWLIST: process.env.PRIVY_BETA_ALLOWLIST,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
