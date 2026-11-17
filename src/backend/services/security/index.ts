import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@/server/prisma";
import { db, lockRows, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { privyAuth } from "@/backend/services/privy";
import {
  ConflictException,
  LockedException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

export type AppDeviceSessionDto = {
  id: string;
  device: string;
  signed_in_at: string;
  current: boolean;
};

const PIN_PATTERN = /^\d{4}$/;

function hashPin(pin: string, salt: Buffer): Buffer {
  const { N, r, p, keyLength } = policy.app.pin.scrypt;
  return scryptSync(pin, salt, keyLength, { N, r, p });
}

function pinMatches(pin: string, hashHex: string, saltHex: string): boolean {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = hashPin(pin, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

class SecurityService {
  isWeakPin(pin: string): boolean {
    if (!PIN_PATTERN.test(pin)) return false;
    const digits = pin.split("").map((character) => Number(character));
    if (digits.every((digit) => digit === digits[0])) return true;
    const steps = digits.slice(1).map((digit, index) => digit - digits[index]!);
    return steps.every((step) => step === 1) || steps.every((step) => step === -1);
  }

  private assertUsablePin(pin: string): void {
    if (!PIN_PATTERN.test(pin)) {
      throw new UnprocessableEntityException("PIN must be exactly 4 digits");
    }
    if (this.isWeakPin(pin)) {
      throw new UnprocessableEntityException("PIN is too easy to guess", "PIN_WEAK");
    }
  }

  private async writePin(userId: string, pin: string): Promise<void> {
    const salt = randomBytes(policy.app.pin.saltBytes);
    const hash = hashPin(pin, salt);
    const data: Prisma.UserUpdateInput = {
      pinHash: hash.toString("hex"),
      pinSalt: salt.toString("hex"),
      pinSetAt: now(),
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    };
    await db.user.update({ where: { id: userId }, data });
  }

  async setPin(userId: string, pin: string, currentPin: string | null): Promise<void> {
    this.assertUsablePin(pin);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.pinHash) {
      if (currentPin === null) {
        throw new ConflictException("Current PIN required to change it", "PIN_REQUIRED");
      }
      await this.verifyPin(userId, currentPin);
    }
    await this.writePin(userId, pin);
  }

  // Runs under a FOR UPDATE lock on the user row so concurrent failures are
  // counted exactly once and never exceed the lock threshold.
  async verifyPin(userId: string, pin: string): Promise<void> {
    const outcome = await withTx(async (tx) => {
      await lockRows(tx, "users", [userId]);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.pinHash || !user.pinSalt) {
        return "required" as const;
      }
      if (user.pinLockedUntil && user.pinLockedUntil > now()) {
        return "locked" as const;
      }
      if (pinMatches(pin, user.pinHash, user.pinSalt)) {
        if (user.pinFailedAttempts !== 0 || user.pinLockedUntil !== null) {
          const data: Prisma.UserUpdateInput = { pinFailedAttempts: 0, pinLockedUntil: null };
          await tx.user.update({ where: { id: userId }, data });
        }
        return "ok" as const;
      }
      const failures = user.pinFailedAttempts + 1;
      if (failures >= policy.app.pin.maxFailures) {
        const data: Prisma.UserUpdateInput = {
          pinFailedAttempts: 0,
          pinLockedUntil: new Date(now().getTime() + policy.app.pin.lockSeconds * 1_000),
        };
        await tx.user.update({ where: { id: userId }, data });
        return "locked" as const;
      }
      const data: Prisma.UserUpdateInput = { pinFailedAttempts: failures };
      await tx.user.update({ where: { id: userId }, data });
      return "incorrect" as const;
    });
    if (outcome === "required") {
      throw new ConflictException("PIN is not set yet", "PIN_REQUIRED");
    }
    if (outcome === "locked") {
      throw new LockedException("Too many wrong PINs; locked for 30 minutes");
    }
    if (outcome === "incorrect") {
      throw new UnprocessableEntityException("Wrong PIN", "PIN_INCORRECT");
    }
  }

  // PIN reset requires a fresh Privy email sign-in: a session ID V3ST has
  // never seen, issued within the re-auth window, for this customer.
  async resetPin(
    userId: string,
    tokens: { accessToken: string; identityToken: string },
    pin: string,
    currentSessionId: string,
  ): Promise<{ revoked: number }> {
    this.assertUsablePin(pin);
    const login = await privyAuth.verifyLogin(tokens);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const fresh = now().getTime() - login.issuedAt.getTime() <= policy.app.privy.reauthMaxAgeSeconds * 1_000;
    if (login.userId !== user.identitySubject || !fresh) {
      throw new UnauthorizedException("A fresh sign-in is required to reset the PIN", "REAUTH_REQUIRED");
    }
    const seen = await db.session.findFirst({
      where: { userId, privySessionId: login.sessionId },
      select: { id: true },
    });
    if (seen) {
      throw new UnauthorizedException("A fresh sign-in is required to reset the PIN", "REAUTH_REQUIRED");
    }
    await withTx(async (tx) => {
      const salt = randomBytes(policy.app.pin.saltBytes);
      const hash = hashPin(pin, salt);
      const userData: Prisma.UserUpdateInput = {
        pinHash: hash.toString("hex"),
        pinSalt: salt.toString("hex"),
        pinSetAt: now(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      };
      await tx.user.update({ where: { id: userId }, data: userData });
      const sessionData: Prisma.SessionUpdateInput = { privySessionId: login.sessionId };
      await tx.session.update({ where: { id: currentSessionId }, data: sessionData });
    });
    return this.revokeOtherSessions(userId, currentSessionId);
  }

  async listSessions(userId: string, currentSessionId: string): Promise<AppDeviceSessionDto[]> {
    const rows = await db.session.findMany({
      where: { userId, expires: { gt: now() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      device: row.deviceLabel ?? "Unknown device",
      signed_in_at: row.createdAt.toISOString(),
      current: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const row = await db.session.findFirst({ where: { id: sessionId, userId } });
    if (!row) {
      throw new NotFoundException("Session not found");
    }
    await db.session.delete({ where: { id: row.id } });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<{ revoked: number }> {
    const result = await db.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    return { revoked: result.count };
  }
}

export const securityService = new SecurityService();
