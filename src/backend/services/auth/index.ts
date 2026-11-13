import { randomBytes } from "node:crypto";

import type { NextResponse } from "next/server";

import type { Prisma, User } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/server/auth/constants";
import { jobService } from "@/backend/services/jobs";
import { UnauthorizedException } from "@/utils/exceptions";
import type { AuthenticatedUser } from "@/backend/middleware/types";

import { issueIdentityToken, simulatedIdentityVerifier } from "./identity";

class AuthService {
  issueBetaIdentityToken(phone: string): { token: string; expiresAt: Date } {
    return issueIdentityToken(phone);
  }

  async signIn(identityToken: string): Promise<{
    user: User;
    sessionToken: string;
    expires: Date;
    created: boolean;
  }> {
    const { subject, phone } = await simulatedIdentityVerifier.verify(identityToken);
    return withTx(async (tx) => {
      let user = await tx.user.findUnique({ where: { identitySubject: subject } });
      let created = false;
      if (!user) {
        const data: Prisma.UserCreateInput = {
          phone,
          identitySubject: subject,
          identityMode: "simulated",
        };
        user = await tx.user.create({ data });
        created = true;
        await jobService.enqueue(tx, {
          kind: "wallets.provision",
          subjectId: user.id,
        });
      }
      const sessionToken = randomBytes(32).toString("base64url");
      const expires = new Date(now().getTime() + SESSION_MAX_AGE_SECONDS * 1_000);
      const sessionData: Prisma.SessionUncheckedCreateInput = {
        sessionToken,
        userId: user.id,
        expires,
      };
      await tx.session.create({ data: sessionData });
      return { user, sessionToken, expires, created };
    });
  }

  async authenticate(sessionToken: string): Promise<AuthenticatedUser> {
    const session = await db.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    if (!session) {
      throw new UnauthorizedException("Invalid session");
    }
    if (session.expires <= now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      throw new UnauthorizedException("Session expired");
    }
    return { ...session.user, session };
  }

  async logout(sessionToken: string): Promise<void> {
    await db.session.deleteMany({ where: { sessionToken } });
  }

  setSessionCookie(res: NextResponse, token: string, _expires: Date): void {
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
  }

  clearSessionCookie(res: NextResponse): void {
    res.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    });
  }
}

export const authService = new AuthService();
