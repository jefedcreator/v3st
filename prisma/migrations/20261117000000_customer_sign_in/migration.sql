-- Customer sign-in: Privy customers sign in by email and never store a phone
-- number; sessions record a device label and the Privy session ID.

ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

ALTER TABLE "sessions" ADD COLUMN "deviceLabel" TEXT;
ALTER TABLE "sessions" ADD COLUMN "privySessionId" TEXT;
