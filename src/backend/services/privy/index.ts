import { verifyAccessToken, verifyIdentityToken } from "@privy-io/node";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { ForbiddenException, UnauthorizedException } from "@/utils/exceptions";

import { privyRuntime, simulatedPublicKeyPem } from "./simulated";

export type PrivyLogin = {
  userId: string;
  sessionId: string;
  issuedAt: Date;
  email: string;
};

function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const segment = parts[1];
    if (segment === undefined) return null;
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

class PrivyAuthService {
  // Verifies Privy access and identity tokens offline against the app's
  // verification key. Never calls Privy's API and holds no app secret.
  async verifyLogin(tokens: { accessToken: string; identityToken: string }): Promise<PrivyLogin> {
    const accessPayload = decodePayload(tokens.accessToken);
    const identityPayload = decodePayload(tokens.identityToken);
    if (!accessPayload || !identityPayload) {
      throw new UnauthorizedException("Invalid sign-in token");
    }
    for (const payload of [accessPayload, identityPayload]) {
      if (typeof payload.exp === "number" && payload.exp * 1_000 <= now().getTime()) {
        throw new UnauthorizedException("Sign-in token expired", "LOGIN_EXPIRED");
      }
    }
    const runtime = privyRuntime();
    const appId = runtime.mode === "sandbox" ? runtime.appId : policy.app.privy.simulatedAppId;
    const verificationKey =
      runtime.mode === "sandbox" ? runtime.verificationKey : simulatedPublicKeyPem();
    if (!appId || !verificationKey) {
      throw new UnauthorizedException("Invalid sign-in token");
    }
    let access: Awaited<ReturnType<typeof verifyAccessToken>>;
    let identityUser: Awaited<ReturnType<typeof verifyIdentityToken>>;
    try {
      access = await verifyAccessToken({
        access_token: tokens.accessToken,
        app_id: appId,
        verification_key: verificationKey,
      });
      identityUser = await verifyIdentityToken({
        identity_token: tokens.identityToken,
        app_id: appId,
        verification_key: verificationKey,
      });
    } catch {
      throw new UnauthorizedException("Invalid sign-in token");
    }
    if (access.user_id !== identityUser.id) {
      throw new UnauthorizedException("Invalid sign-in token");
    }
    const emailAccount = identityUser.linked_accounts.find((account) => account.type === "email");
    if (emailAccount?.type !== "email" || !emailAccount?.address) {
      throw new ForbiddenException("No email linked to this sign-in", "LOGIN_NOT_ALLOWED");
    }
    return {
      userId: access.user_id,
      sessionId: access.session_id,
      issuedAt: new Date(access.issued_at * 1_000),
      email: emailAccount.address.toLowerCase(),
    };
  }
}

export const privyAuth = new PrivyAuthService();
