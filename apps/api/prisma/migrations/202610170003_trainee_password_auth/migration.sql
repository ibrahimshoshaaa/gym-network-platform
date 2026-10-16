-- Additive: existing users remain passwordless and unverified; no implicit
-- account claiming, credentials, roles or contact ownership are backfilled.
ALTER TABLE "User"
  ADD COLUMN email TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_email_key" ON "User"(email);
ALTER TABLE "User" ADD CONSTRAINT user_normalized_email CHECK (
  email IS NULL OR (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254));

CREATE TABLE "UserPassword" (
  "userId" UUID PRIMARY KEY,
  "passwordHash" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPassword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT password_hash_format CHECK ("passwordHash" ~ '^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{128}$')
);
CREATE TABLE "AuthThrottle" (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT auth_throttle_key CHECK (key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_throttle_positive CHECK (attempts > 0)
);
CREATE INDEX "AuthThrottle_expiresAt_idx" ON "AuthThrottle"("expiresAt");
