-- Allow any valid E.164 phone for newly created identities in the isolated OTP trial.
ALTER TABLE "PhoneTestIdentity"
 DROP CONSTRAINT "PhoneTestIdentity_phone_check",
 ADD CONSTRAINT "PhoneTestIdentity_phone_check" CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');
