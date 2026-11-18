-- Beta waitlist sign-ups and fixed-window rate-limit buckets.

CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");

CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key", "windowStart")
);
