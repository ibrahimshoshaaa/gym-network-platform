CREATE TABLE "AccountDeletion" (
 id uuid PRIMARY KEY,"userId" uuid NOT NULL UNIQUE REFERENCES "User"(id),
 "requestKeyHash" text NOT NULL UNIQUE CHECK ("requestKeyHash" ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ERASING','COMPLETED','CANCELLED')),
 "requestedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"reviewDueAt" timestamp(3) NOT NULL,
 "erasedAt" timestamp(3),"completedAt" timestamp(3),"reviewedById" uuid REFERENCES "User"(id),"updatedAt" timestamp(3) NOT NULL,
 CHECK ((status IN ('PENDING','CANCELLED') AND "erasedAt" IS NULL AND "completedAt" IS NULL) OR (status='ERASING' AND "completedAt" IS NULL) OR (status='COMPLETED' AND "erasedAt" IS NOT NULL AND "completedAt" IS NOT NULL))
);
CREATE INDEX "AccountDeletion_status_requestedAt_id_idx" ON "AccountDeletion"(status,"requestedAt",id);
CREATE TABLE "AccountDeletionAsset" (
 id uuid PRIMARY KEY,"deletionId" uuid NOT NULL REFERENCES "AccountDeletion"(id),"objectKey" text NOT NULL,
 "deliveryType" text NOT NULL CHECK("deliveryType" IN ('upload','authenticated')),
 "completedAt" timestamp(3),attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 UNIQUE("deletionId","objectKey","deliveryType")
);
CREATE INDEX "AccountDeletionAsset_deletionId_completedAt_idx" ON "AccountDeletionAsset"("deletionId","completedAt");
-- These exceptions are scoped to identity erasure, never the financial ledger.
CREATE FUNCTION account_erasure_active(uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "AccountDeletion" d JOIN "User" u ON u.id=d."userId"
 WHERE u.id=uid AND d.status='ERASING' AND NOT u."isActive" AND u.email IS NULL AND u."phoneE164"='deleted:'||uid::text)
$$;
CREATE OR REPLACE FUNCTION protect_support_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM "SupportTicket" t WHERE t.id=OLD."ticketId" AND account_erasure_active(t."userId")) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Support messages are immutable'; END $$;
-- Preserve the existing application guard for all ordinary writes.
ALTER FUNCTION protect_gym_application() RENAME TO protect_gym_application_history;
CREATE FUNCTION protect_gym_application() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND account_erasure_active(OLD."ownerId") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Application deletion requires account erasure'; END $$;
DROP TRIGGER "GymApplication_protect" ON "GymApplication";
CREATE TRIGGER "GymApplication_protect" BEFORE UPDATE ON "GymApplication" FOR EACH ROW EXECUTE FUNCTION protect_gym_application_history();
CREATE TRIGGER "GymApplication_delete" BEFORE DELETE ON "GymApplication" FOR EACH ROW EXECUTE FUNCTION protect_gym_application();
CREATE FUNCTION protect_phone_identity_erasure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND account_erasure_active(OLD."userId") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Phone identity is immutable'; END $$;
DROP TRIGGER phone_test_identity_immutable ON "PhoneTestIdentity";
CREATE TRIGGER phone_test_identity_immutable BEFORE UPDATE OR DELETE ON "PhoneTestIdentity" FOR EACH ROW EXECUTE FUNCTION protect_phone_identity_erasure();
CREATE FUNCTION protect_receipt_erasure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND account_erasure_active(OLD."ownerUserId")
 AND NOT EXISTS(SELECT 1 FROM "TopupRequest" WHERE "receiptId"=OLD.id OR "receiptObjectKey"=OLD."objectKey")
 AND NOT EXISTS(SELECT 1 FROM "FinancialEvidenceUse" WHERE "receiptId"=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM "WithdrawalRequest" WHERE "proofReceiptId"=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM "OperationReview" WHERE "evidenceId"=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM "SupportMessage" WHERE "receiptId"=OLD.id)
 THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Financial evidence is immutable'; END $$;
DROP TRIGGER receipt_evidence_immutable ON "ReceiptEvidence";
CREATE TRIGGER receipt_evidence_immutable BEFORE UPDATE OR DELETE ON "ReceiptEvidence" FOR EACH ROW EXECUTE FUNCTION protect_receipt_erasure();
CREATE FUNCTION protect_erased_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "AccountDeletion" WHERE "userId"=OLD.id AND "erasedAt" IS NOT NULL)
 AND (NEW."isActive" OR NEW.email IS NOT NULL OR NEW."phoneE164"<>'deleted:'||OLD.id::text OR NEW."displayName"<>'حساب محذوف' OR NEW."phoneVerifiedAt" IS NOT NULL OR NEW."emailVerifiedAt" IS NOT NULL)
 THEN RAISE EXCEPTION 'Erased identity cannot be restored'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER "User_erasure_guard" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION protect_erased_user();
CREATE FUNCTION protect_deletion_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('ERASING','COMPLETED') AND (NEW."userId",NEW."requestKeyHash",NEW."requestedAt",NEW."erasedAt") IS DISTINCT FROM (OLD."userId",OLD."requestKeyHash",OLD."requestedAt",OLD."erasedAt") AND OLD."erasedAt" IS NOT NULL
 OR OLD.status='COMPLETED' AND NEW IS DISTINCT FROM OLD OR OLD.status='ERASING' AND NEW.status NOT IN ('ERASING','COMPLETED') OR NEW."userId"<>OLD."userId"
 THEN RAISE EXCEPTION 'Deletion history is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER "AccountDeletion_history" BEFORE UPDATE OR DELETE ON "AccountDeletion" FOR EACH ROW EXECUTE FUNCTION protect_deletion_history();
CREATE FUNCTION check_account_erased() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE d "AccountDeletion"; BEGIN
 SELECT * INTO d FROM "AccountDeletion" WHERE id=NEW.id;
 IF d.status IN ('ERASING','COMPLETED') AND (d."erasedAt" IS NULL OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=d."userId" AND NOT "isActive" AND email IS NULL AND "phoneE164"='deleted:'||d."userId"::text)
 OR EXISTS(SELECT 1 FROM "UserPassword" WHERE "userId"=d."userId") OR EXISTS(SELECT 1 FROM "AuthSession" WHERE "userId"=d."userId" AND ("revokedAt" IS NULL OR "tokenHash" NOT LIKE 'deleted:%'))
 OR EXISTS(SELECT 1 FROM "PhoneTestIdentity" WHERE "userId"=d."userId")) THEN RAISE EXCEPTION 'Incomplete identity erasure'; END IF;
 IF d.status='COMPLETED' AND EXISTS(SELECT 1 FROM "AccountDeletionAsset" WHERE "deletionId"=d.id AND "completedAt" IS NULL) THEN RAISE EXCEPTION 'Media erasure is incomplete'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER "AccountDeletion_complete" AFTER INSERT OR UPDATE ON "AccountDeletion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_account_erased();
-- Serialize new personal content/credentials against the deletion's User lock.
CREATE FUNCTION reject_erased_identity_write() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE uid uuid; BEGIN
 uid:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 PERFORM id FROM "User" WHERE id=uid FOR SHARE;
 IF EXISTS(SELECT 1 FROM "AccountDeletion" WHERE "userId"=uid AND status IN ('ERASING','COMPLETED')) THEN RAISE EXCEPTION 'Account has been erased'; END IF;
 RETURN NEW; END $$;
DO $$ DECLARE spec text[]; BEGIN
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
 ['UserPassword','userId'],['AuthSession','userId'],['AccountRecovery','userId'],['PhoneTestIdentity','userId'],
 ['SupportTicket','userId'],['SupportMessage','authorId'],['NotificationRead','userId'],['BusinessImage','ownerId'],
 ['MarketListing','sellerId'],['MarketImage','ownerId'],['MarketReport','reporterId'],['MaintenanceRequest','createdById'],['MaintenanceImage','ownerId'],
 ['MaintenanceEvent','actorId'],['PromotionRequest','requestedById'],['PromotionImage','ownerId'],['VisitRating','traineeId'],['GymApplication','ownerId'],['Gym','ownerId'],['ReceiptEvidence','ownerUserId'],['Booking','traineeId']
 ] LOOP
 EXECUTE format('CREATE TRIGGER account_identity_insert BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION reject_erased_identity_write(%L)',spec[1],spec[2]);
 END LOOP;
END $$;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON "AccountDeletion","AccountDeletionAsset" TO %I',r);
 EXECUTE format('GRANT DELETE ON "GymApplication","PhoneTestIdentity","ReceiptEvidence" TO %I',r);
 END IF;
 END LOOP; END $$;
CREATE TABLE "AccountUploadLease" (
 id uuid PRIMARY KEY,"userId" uuid NOT NULL REFERENCES "User"(id),"objectKey" text NOT NULL UNIQUE,
 "deliveryType" text NOT NULL CHECK("deliveryType" IN ('upload','authenticated')),"expiresAt" timestamp(3) NOT NULL
);
CREATE INDEX "AccountUploadLease_userId_expiresAt_idx" ON "AccountUploadLease"("userId","expiresAt");
CREATE TRIGGER account_identity_insert BEFORE INSERT ON "AccountUploadLease" FOR EACH ROW EXECUTE FUNCTION reject_erased_identity_write('userId');
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON "AccountUploadLease" TO %I',r); END IF;
 END LOOP; END $$;
CREATE FUNCTION reject_erased_identity_update() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE uid uuid; BEGIN
 uid:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 PERFORM id FROM "User" WHERE id=uid FOR SHARE;
 IF EXISTS(SELECT 1 FROM "AccountDeletion" WHERE "userId"=uid AND "erasedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Account has been erased'; END IF;
 RETURN NEW; END $$;
DO $$ DECLARE spec text[]; BEGIN
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
 ['UserPassword','userId'],['AuthSession','userId'],['AccountRecovery','userId'],['PhoneTestIdentity','userId'],
 ['SupportTicket','userId'],['NotificationRead','userId'],['BusinessImage','ownerId'],['MarketListing','sellerId'],['MarketImage','ownerId'],
 ['MarketReport','reporterId'],['MaintenanceRequest','createdById'],['MaintenanceImage','ownerId'],['MaintenanceEvent','actorId'],
 ['PromotionRequest','requestedById'],['PromotionImage','ownerId'],['VisitRating','traineeId'],['GymApplication','ownerId'],['Gym','ownerId'],
 ['StaffAssignment','userId'],['StaffDelegation','userId'],['StaffInvitation','userId'],['QrTicket','userId']
 ] LOOP
 EXECUTE format('CREATE TRIGGER account_identity_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION reject_erased_identity_update(%L)',spec[1],spec[2]);
 END LOOP;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['StaffAssignment','userId'],['StaffDelegation','userId'],['StaffInvitation','userId'],['QrTicket','userId']] LOOP
 EXECUTE format('CREATE TRIGGER account_identity_insert BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION reject_erased_identity_write(%L)',spec[1],spec[2]);
 END LOOP;
END $$;
