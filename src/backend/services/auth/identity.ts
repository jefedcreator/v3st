import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { env } from "@/env";
import type { ProviderMode } from "@/backend/integrations/beta-policy";
import { UnauthorizedException, UnprocessableEntityException } from "@/utils/exceptions";

export interface IdentityVerifier {
  readonly mode: ProviderMode;
  verify(token: string): Promise<{ subject: string; phone: string }>;
}

const TEST_PHONE = new RegExp(policy.auth.testPhonePattern);

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export const simulatedIdentityVerifier: IdentityVerifier = {
  mode: "simulated",

  async verify(token: string): Promise<{ subject: string; phone: string }> {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new UnauthorizedException("Invalid identity token");
    }
    const payloadPart = parts[0];
    const signaturePart = parts[1];
    const expected = createHmac("sha256", env.SIMULATED_IDENTITY_SECRET)
      .update(payloadPart)
      .digest("base64url");
    const a = Buffer.from(signaturePart);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid identity token");
    }
    let payload: { sub?: unknown; phone?: unknown; exp?: unknown };
    try {
      payload = JSON.parse(
        Buffer.from(payloadPart, "base64url").toString("utf8"),
      ) as typeof payload;
    } catch {
      throw new UnauthorizedException("Invalid identity token");
    }
    if (
      typeof payload.sub !== "string" ||
      typeof payload.phone !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1_000 <= now().getTime()
    ) {
      throw new UnauthorizedException("Invalid or expired identity token");
    }
    return { subject: payload.sub, phone: payload.phone };
  },
};

export function assertTestPhone(phone: string): void {
  if (!TEST_PHONE.test(phone)) {
    throw new UnprocessableEntityException(
      "Only beta test phones (+2340000000000–+2340000000999) are accepted",
      "TEST_PHONE_REQUIRED",
    );
  }
}

export function issueIdentityToken(phone: string): { token: string; expiresAt: Date } {
  assertTestPhone(phone);
  const expiresAt = new Date(now().getTime() + policy.auth.identityTokenTtlSeconds * 1_000);
  const payload = {
    sub: `sim:${phone}`,
    phone,
    exp: Math.floor(expiresAt.getTime() / 1_000),
    nonce: randomBytes(8).toString("hex"),
  };
  const payloadPart = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", env.SIMULATED_IDENTITY_SECRET)
    .update(payloadPart)
    .digest("base64url");
  return { token: `${payloadPart}.${signature}`, expiresAt };
}
