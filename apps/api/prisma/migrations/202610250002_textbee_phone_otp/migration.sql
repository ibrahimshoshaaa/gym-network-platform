-- Test challenges stay isolated; live SMS uses random, keyed codes.
ALTER TABLE "PhoneOtpChallenge" DROP CONSTRAINT "PhoneOtpChallenge_mode_check",
 ADD CONSTRAINT "PhoneOtpChallenge_mode_check" CHECK(mode IN ('test','textbee'));
