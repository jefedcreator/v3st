import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { authService } from "@/backend/services/auth";
import type { AuthenticatedUser } from "@/backend/middleware/types";
import { UnauthorizedException } from "@/utils/exceptions";

// The current customer of a request, or null when there is no valid session.
// Wrapped in React cache() so one request reads the cookie at most once.
export const getCurrentCustomer = cache(async (): Promise<AuthenticatedUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined) return null;
  try {
    return await authService.authenticate(token);
  } catch (error) {
    if (error instanceof UnauthorizedException) return null;
    throw error;
  }
});

// Redirects an anonymous reader to sign-in, remembering where they were going.
export async function requireCustomer(nextPath: string): Promise<AuthenticatedUser> {
  const user = await getCurrentCustomer();
  if (user === null) {
    redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}
