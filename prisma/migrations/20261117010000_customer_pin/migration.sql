-- Customer transaction PIN: scrypt hash with per-user salt, failure counter and lock.

ALTER TABLE "users" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "users" ADD COLUMN "pinSalt" TEXT;
ALTER TABLE "users" ADD COLUMN "pinSetAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
