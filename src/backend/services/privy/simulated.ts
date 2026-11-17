import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";

import { z } from "zod";

import { policy } from "@/backend/config/policy";
import { InternalServerErrorException, NotFoundException } from "@/utils/exceptions";

export type PrivyRuntime = {
  mode: "sandbox" | "simulated";
  appId: string | undefined;
  verificationKey: string | undefined;
  betaAllowlist: string[];
};

// Reads the live process env so tests can switch modes; src/env.js validates
// the same variables (with the same defaults) when the app boots.
export function privyRuntime(): PrivyRuntime {
  const parsed = z
    .enum(["sandbox", "simulated"])
    .default("simulated")
    .safeParse(process.env.PRIVY_MODE ?? undefined);
  if (!parsed.success) {
    throw new InternalServerErrorException("Invalid PRIVY_MODE");
  }
  return {
    mode: parsed.data,
    appId: process.env.PRIVY_APP_ID ?? undefined,
    verificationKey: process.env.PRIVY_VERIFICATION_KEY ?? undefined,
    betaAllowlist: (process.env.PRIVY_BETA_ALLOWLIST ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  };
}

let issuerKeys: { privateKey: KeyObject; publicKey: KeyObject } | null = null;

function keys(): { privateKey: KeyObject; publicKey: KeyObject } {
  issuerKeys ??= generateKeyPairSync("ec", { namedCurve: "P-256" });
  return issuerKeys;
}

export function simulatedPublicKeyPem(): string {
  return keys().publicKey.export({ type: "spki", format: "pem" }).toString();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, privateKey: KeyObject): string {
  const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${body}.${base64url(signature)}`;
}

function simulatedSubject(email: string): string {
  return `did:privy:sim${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

// Local Privy-shaped issuer used in CI and local development. It never runs
// outside PRIVY_MODE=simulated and holds no Privy credentials.
export const simulatedPrivy = {
  subjectFor(email: string): string {
    return simulatedSubject(email);
  },
  mint(
    email: string,
    opts?: { sessionId?: string; issuedAt?: Date },
  ): { access_token: string; identity_token: string } {
    if (privyRuntime().mode !== "simulated") {
      throw new NotFoundException("Simulated sign-in tokens are only available in simulated mode");
    }
    const { privateKey } = keys();
    const appId = policy.app.privy.simulatedAppId;
    const iat = Math.floor((opts?.issuedAt?.getTime() ?? Date.now()) / 1_000);
    const sub = simulatedSubject(email);
    const sid = opts?.sessionId ?? randomUUID();
    const access_token = signJwt(
      { sid, sub, iss: "privy.io", aud: appId, iat, exp: iat + 3_600 },
      privateKey,
    );
    const identity_token = signJwt(
      {
        sub,
        iss: "privy.io",
        aud: appId,
        iat,
        exp: iat + 3_600,
        cr: String(iat),
        linked_accounts: JSON.stringify([{ type: "email", address: email.toLowerCase(), lv: iat }]),
      },
      privateKey,
    );
    return { access_token, identity_token };
  },
};
