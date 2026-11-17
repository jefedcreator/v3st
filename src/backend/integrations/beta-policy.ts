import { env } from "@/env";

export type ProviderMode = "sandbox" | "simulated";

export type IntegrationId =
  | "yellowcard"
  | "paycrest"
  | "identity"
  | "kyc"
  | "screening"
  | "wallets"
  | "venues"
  | "earnings"
  | "settlement"
  | "privy";

export type IntegrationModes = Record<IntegrationId, ProviderMode>;

export const BETA_ALLOWED_MODES: Record<IntegrationId, readonly ProviderMode[]> = {
  yellowcard: ["sandbox", "simulated"],
  paycrest: ["simulated"],
  identity: ["simulated"],
  kyc: ["simulated"],
  screening: ["simulated"],
  wallets: ["simulated"],
  venues: ["simulated"],
  earnings: ["simulated"],
  settlement: ["simulated"],
  privy: ["sandbox", "simulated"],
};

export const YELLOWCARD_SANDBOX_URL = "https://sandbox.api.yellowcard.io/business";

export class BetaPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetaPolicyError";
  }
}

export type BetaEnvSource = {
  APP_STAGE?: string;
  NODE_ENV?: string;
  YELLOWCARD_MODE?: string;
  YELLOWCARD_API_KEY?: string;
  YELLOWCARD_API_SECRET?: string;
  PRIVY_MODE?: string;
  PRIVY_APP_ID?: string;
  PRIVY_VERIFICATION_KEY?: string;
};

const SIMULATED_ONLY: readonly IntegrationId[] = [
  "paycrest",
  "identity",
  "kyc",
  "screening",
  "wallets",
  "venues",
  "earnings",
  "settlement",
];

export function assertBetaRuntime(source: BetaEnvSource): IntegrationModes {
  if (source.APP_STAGE !== "beta") {
    throw new BetaPolicyError(
      `APP_STAGE must be "beta" for this release (got ${JSON.stringify(source.APP_STAGE)})`,
    );
  }
  const yellowcardMode = source.YELLOWCARD_MODE ?? "simulated";
  if (!BETA_ALLOWED_MODES.yellowcard.includes(yellowcardMode as ProviderMode)) {
    throw new BetaPolicyError(
      `YELLOWCARD_MODE must be one of ${BETA_ALLOWED_MODES.yellowcard.join(", ")} (got ${JSON.stringify(yellowcardMode)})`,
    );
  }
  if (yellowcardMode === "sandbox" && (!source.YELLOWCARD_API_KEY || !source.YELLOWCARD_API_SECRET)) {
    throw new BetaPolicyError(
      "YELLOWCARD_MODE=sandbox requires YELLOWCARD_API_KEY and YELLOWCARD_API_SECRET",
    );
  }
  const privyMode = source.PRIVY_MODE ?? "simulated";
  if (!BETA_ALLOWED_MODES.privy.includes(privyMode as ProviderMode)) {
    throw new BetaPolicyError(
      `PRIVY_MODE must be one of ${BETA_ALLOWED_MODES.privy.join(", ")} (got ${JSON.stringify(privyMode)})`,
    );
  }
  if (privyMode === "sandbox" && (!source.PRIVY_APP_ID || !source.PRIVY_VERIFICATION_KEY)) {
    throw new BetaPolicyError(
      "PRIVY_MODE=sandbox requires PRIVY_APP_ID and PRIVY_VERIFICATION_KEY (SPKI PEM); no app secret is used",
    );
  }
  const modes = {} as IntegrationModes;
  modes.yellowcard = yellowcardMode as ProviderMode;
  modes.privy = privyMode as ProviderMode;
  for (const id of SIMULATED_ONLY) {
    modes[id] = "simulated";
  }
  return modes;
}

let cachedModes: IntegrationModes | null = null;

export function integrationModes(): IntegrationModes {
  cachedModes ??= assertBetaRuntime({
    APP_STAGE: env.APP_STAGE,
    NODE_ENV: env.NODE_ENV,
    YELLOWCARD_MODE: env.YELLOWCARD_MODE,
    YELLOWCARD_API_KEY: env.YELLOWCARD_API_KEY,
    YELLOWCARD_API_SECRET: env.YELLOWCARD_API_SECRET,
    PRIVY_MODE: env.PRIVY_MODE,
    PRIVY_APP_ID: env.PRIVY_APP_ID,
    PRIVY_VERIFICATION_KEY: env.PRIVY_VERIFICATION_KEY,
  });
  return cachedModes;
}

export function assertAllowedUrl(integration: "yellowcard", url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BetaPolicyError(`Invalid URL for ${integration}: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new BetaPolicyError(`${integration} requires https (got ${parsed.protocol}//${parsed.host})`);
  }
  if (parsed.host !== "sandbox.api.yellowcard.io") {
    throw new BetaPolicyError(
      `${integration} is only allowed on host sandbox.api.yellowcard.io in beta (got ${parsed.host})`,
    );
  }
  if (!parsed.pathname.startsWith("/business/")) {
    throw new BetaPolicyError(`${integration} sandbox paths must start with /business/ (got ${parsed.pathname})`);
  }
}
