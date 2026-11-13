import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

export async function register(): Promise<void> {
  if (env.SENTRY_DSN) {
    Sentry.init({ dsn: env.SENTRY_DSN, environment: "beta" });
  }
}
