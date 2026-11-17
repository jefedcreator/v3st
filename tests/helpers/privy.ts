import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

export function privyTestKeys(): { privateKey: KeyObject; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function mintJwt(payload: Record<string, unknown>, privateKey: KeyObject): string {
  const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${body}.${base64url(signature)}`;
}

// Builds the same token shapes the simulated issuer produces, with a test key,
// so tests can run the sandbox verification path offline by pointing
// PRIVY_VERIFICATION_KEY at privyTestKeys().publicKeyPem.
export function mintPrivyTokens(i: {
  privateKey: KeyObject;
  appId: string;
  userId: string;
  email: string;
  sessionId: string;
  issuedAt?: Date;
  expiresInSeconds?: number;
  extraLinkedAccounts?: unknown[];
}): { access_token: string; identity_token: string } {
  const iat = Math.floor((i.issuedAt?.getTime() ?? Date.now()) / 1_000);
  const exp = iat + (i.expiresInSeconds ?? 3_600);
  const access_token = mintJwt(
    { sid: i.sessionId, sub: i.userId, iss: "privy.io", aud: i.appId, iat, exp },
    i.privateKey,
  );
  const linkedAccounts = [
    { type: "email", address: i.email, lv: iat },
    ...(i.extraLinkedAccounts ?? []),
  ];
  const identity_token = mintJwt(
    {
      sub: i.userId,
      iss: "privy.io",
      aud: i.appId,
      iat,
      exp,
      cr: String(iat),
      linked_accounts: JSON.stringify(linkedAccounts),
    },
    i.privateKey,
  );
  return { access_token, identity_token };
}
