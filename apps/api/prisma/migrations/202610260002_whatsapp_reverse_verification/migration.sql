ALTER TABLE "PhoneOtpChallenge"
 ADD COLUMN "whatsappMessageHash" TEXT,
 ADD COLUMN "whatsappMessageId" TEXT,
 ADD COLUMN "whatsappDestinationId" TEXT,
 ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "PhoneOtpChallenge" DROP CONSTRAINT "PhoneOtpChallenge_mode_check",
 ADD CONSTRAINT "PhoneOtpChallenge_mode_check" CHECK(mode IN ('test','textbee','whatsapp')),
 ADD CONSTRAINT "PhoneOtpChallenge_whatsapp_check" CHECK (
  (mode='whatsapp' AND "whatsappMessageHash" IS NOT NULL AND "whatsappMessageHash" ~ '^[0-9a-f]{64}$' AND "whatsappDestinationId" IS NOT NULL)
  OR (mode<>'whatsapp' AND "whatsappMessageHash" IS NULL AND "whatsappMessageId" IS NULL AND "whatsappDestinationId" IS NULL AND "verifiedAt" IS NULL)
 );
CREATE UNIQUE INDEX "PhoneOtpChallenge_whatsappMessageHash_key" ON "PhoneOtpChallenge"("whatsappMessageHash");
CREATE UNIQUE INDEX "PhoneOtpChallenge_whatsappMessageId_key" ON "PhoneOtpChallenge"("whatsappMessageId");
