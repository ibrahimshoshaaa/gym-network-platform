CREATE TABLE "PhoneOtpChallenge" (
 id UUID PRIMARY KEY,
 phone TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK (purpose IN ('REGISTER','RESET')),
 mode TEXT NOT NULL CHECK (mode='test'),
 "codeHash" TEXT NOT NULL CHECK ("codeHash" ~ '^[0-9a-f]{64}$'),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "consumedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PhoneOtpChallenge_phone_purpose_createdAt_idx" ON "PhoneOtpChallenge"(phone,purpose,"createdAt");
CREATE TABLE "PhoneTestIdentity" (
 "userId" UUID PRIMARY KEY REFERENCES "User"(id),
 phone TEXT NOT NULL UNIQUE CHECK (phone IN ('+15555550123','+15555550124')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER phone_test_identity_immutable BEFORE UPDATE OR DELETE ON "PhoneTestIdentity" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN
  GRANT SELECT,INSERT,UPDATE ON "PhoneOtpChallenge" TO gym_api_service;
  GRANT SELECT,INSERT ON "PhoneTestIdentity" TO gym_api_service;
 END IF;
END $$;
