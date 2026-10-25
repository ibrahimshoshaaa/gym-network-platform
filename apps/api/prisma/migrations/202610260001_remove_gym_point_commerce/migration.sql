-- Preserve the original financial facts before removing the obsolete product model.
-- This migration never changes a posting, a transaction, or an account balance.
CREATE TABLE "FinancialArchiveRecord" (
 id uuid PRIMARY KEY, "recordType" text NOT NULL, "recordId" uuid NOT NULL,
 "ownerUserIds" uuid[] NOT NULL, "requiresReview" boolean NOT NULL DEFAULT false,
 "amountPiasters" bigint NOT NULL DEFAULT 0, points integer NOT NULL DEFAULT 0,
 data jsonb NOT NULL, "archivedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("recordType","recordId")
);
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'POINT_ACCOUNT',a.id,array_remove(ARRAY[g."ownerId"],NULL),a.balance<>0,0,a.balance,to_jsonb(a),CURRENT_TIMESTAMP
 FROM "PointAccount" a LEFT JOIN "Branch" b ON b.id=a."branchId" LEFT JOIN "Gym" g ON g.id=coalesce(a."gymId",b."gymId")
 WHERE a.type IN ('GYM_INVENTORY','BRANCH_INVENTORY');
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'TOPUP',t.id,array_remove(ARRAY[t."requestorUserId",g."ownerId"],NULL),t.status='PENDING',t."chargePiasters",t.points,to_jsonb(t),CURRENT_TIMESTAMP
 FROM "TopupRequest" t LEFT JOIN "Branch" b ON b.id=t."receivingBranchId" LEFT JOIN "Gym" g ON g.id=coalesce(t."receivingGymId",b."gymId")
 WHERE t.kind IS DISTINCT FROM 'TRAINEE' OR t."receivingGymId" IS NOT NULL OR t."receivingBranchId" IS NOT NULL;
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'DISPATCH',d.id,array_remove(ARRAY[d."actorId",d."recipientId",g."ownerId"],NULL),false,d."chargePiasters",d.points,to_jsonb(d),CURRENT_TIMESTAMP
 FROM "PointDispatch" d LEFT JOIN "Gym" g ON g.id=d."gymId"
 WHERE d.kind<>'ADMIN_TOPUP' OR d."gymId" IS NOT NULL OR d."branchId" IS NOT NULL;
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'SALE',s.id,array_remove(ARRAY[s."cashierId",s."traineeId",g."ownerId"],NULL),false,s."chargePiasters",s.points,to_jsonb(s),CURRENT_TIMESTAMP
 FROM "PointSale" s JOIN "Branch" b ON b.id=s."branchId" JOIN "Gym" g ON g.id=b."gymId";
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'REVIEW',r.id,array_remove(ARRAY[r."requestorId",g."ownerId"],NULL),r.status='PENDING',0,0,to_jsonb(r),CURRENT_TIMESTAMP
 FROM "OperationReview" r JOIN "Branch" b ON b.id=r."branchId" JOIN "Gym" g ON g.id=b."gymId" WHERE r.kind='SALE_CORRECTION';
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'PACKAGE',p.id,ARRAY[]::uuid[],false,0,p.points,to_jsonb(p),CURRENT_TIMESTAMP FROM "TopupPackage" p WHERE kind<>'TRAINEE';
INSERT INTO "FinancialArchiveRecord"
 SELECT gen_random_uuid(),'PRICING',p.id,ARRAY[p."createdById"],false,0,0,to_jsonb(p),CURRENT_TIMESTAMP FROM "PricingPolicy" p;

-- Reject any unexpected dependency instead of silently dropping financial links.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "VisitCancellation" c JOIN "OperationReview" r ON r.id=c."reviewId" WHERE r.kind='SALE_CORRECTION')
 THEN RAISE EXCEPTION 'Unexpected archived review linked to a visit cancellation'; END IF;
END $$;
ALTER TABLE "OperationReview" DISABLE TRIGGER operation_review_guard;
DELETE FROM "OperationReview" WHERE kind='SALE_CORRECTION';
ALTER TABLE "OperationReview" ENABLE TRIGGER operation_review_guard;
ALTER TABLE "FinancialEvidenceUse" ADD COLUMN "archiveRecordId" uuid UNIQUE REFERENCES "FinancialArchiveRecord"(id);
ALTER TABLE "FinancialEvidenceUse" DROP CONSTRAINT "FinancialEvidenceUse_check";
ALTER TABLE "FinancialEvidenceUse" ADD CONSTRAINT financial_evidence_one_target CHECK (("topupId" IS NOT NULL)::int+("withdrawalId" IS NOT NULL)::int+("archiveRecordId" IS NOT NULL)::int=1);
ALTER TABLE "FinancialEvidenceUse" DISABLE TRIGGER financial_evidence_immutable;
UPDATE "FinancialEvidenceUse" e SET "topupId"=NULL,"archiveRecordId"=a.id FROM "FinancialArchiveRecord" a WHERE a."recordType"='TOPUP' AND a."recordId"=e."topupId";
ALTER TABLE "FinancialEvidenceUse" ENABLE TRIGGER financial_evidence_immutable;
ALTER TABLE "TopupRequest" DISABLE TRIGGER topup_history;
DELETE FROM "TopupRequest" WHERE id IN (SELECT "recordId" FROM "FinancialArchiveRecord" WHERE "recordType"='TOPUP');
ALTER TABLE "TopupRequest" ENABLE TRIGGER topup_history;
ALTER TABLE "PointDispatch" DISABLE TRIGGER "PointDispatch_immutable";
DELETE FROM "PointDispatch" WHERE id IN (SELECT "recordId" FROM "FinancialArchiveRecord" WHERE "recordType"='DISPATCH');
ALTER TABLE "PointDispatch" ENABLE TRIGGER "PointDispatch_immutable";
DELETE FROM "TopupPackage" WHERE kind<>'TRAINEE';

ALTER TABLE "OperationReview" DROP CONSTRAINT review_target, DROP CONSTRAINT sale_refund_policy_pending, DROP COLUMN "saleId";
DROP TABLE "PointSale";
ALTER TABLE "OperationReview" ALTER COLUMN "visitId" SET NOT NULL;
CREATE TYPE "OperationReviewKind_new" AS ENUM ('VISIT_CANCEL');
ALTER TABLE "OperationReview" ALTER COLUMN kind TYPE "OperationReviewKind_new" USING kind::text::"OperationReviewKind_new";
DROP TYPE "OperationReviewKind";
ALTER TYPE "OperationReviewKind_new" RENAME TO "OperationReviewKind";
CREATE OR REPLACE FUNCTION guard_operation_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_branch uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable operation review' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' THEN RAISE EXCEPTION 'Review must start pending' USING ERRCODE='23514'; END IF;
  SELECT "branchId" INTO target_branch FROM "Visit" WHERE id=NEW."visitId";
  IF target_branch IS DISTINCT FROM NEW."branchId" THEN RAISE EXCEPTION 'Review target mismatch' USING ERRCODE='23514'; END IF;
 ELSIF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR
  (to_jsonb(NEW)-ARRAY['status','reviewedById','reviewReason','reviewedAt']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['status','reviewedById','reviewReason','reviewedAt'])
 THEN RAISE EXCEPTION 'Immutable review facts or decision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

ALTER TABLE "TopupRequest" DROP CONSTRAINT topup_snapshot_valid, DROP COLUMN "receivingGymId", DROP COLUMN "receivingBranchId";
ALTER TABLE "TopupRequest" ALTER COLUMN kind SET NOT NULL;
CREATE TYPE "TopupKind_new" AS ENUM ('TRAINEE');
ALTER TABLE "TopupRequest" ALTER COLUMN kind TYPE "TopupKind_new" USING kind::text::"TopupKind_new";
ALTER TABLE "TopupPackage" ALTER COLUMN kind TYPE "TopupKind_new" USING kind::text::"TopupKind_new";
DROP TYPE "TopupKind";
ALTER TYPE "TopupKind_new" RENAME TO "TopupKind";
ALTER TABLE "TopupRequest" ADD CONSTRAINT topup_snapshot_valid CHECK (
 kind='TRAINEE' AND "unitPricePiasters" IS NOT NULL AND "discountBps" IS NOT NULL AND "redemptionBps" IS NOT NULL AND "unitPricePiasters">0 AND "discountBps"=0 AND "redemptionBps" BETWEEN 1 AND 10000
 AND "policyId" IS NOT NULL AND "receiptId" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND "requestHash" IS NOT NULL
 AND "paymentMethodType" IS NOT NULL AND "paymentAccount" IS NOT NULL AND "paymentAccountName" IS NOT NULL
 AND ((status='PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL AND "pointTransactionId" IS NULL AND "paymentReference" IS NULL)
 OR (status='REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND length("reviewReason")>0 AND "pointTransactionId" IS NULL AND "paymentReference" IS NULL)
 OR (status='APPROVED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND length("reviewReason")>0 AND "pointTransactionId" IS NOT NULL AND "paymentReference" IS NOT NULL)));
ALTER TABLE "PricingPolicy" DROP CONSTRAINT pricing_policy_valid, DROP COLUMN "gymDiscountBps";
ALTER TABLE "PricingPolicy" ADD CONSTRAINT pricing_policy_valid CHECK (version>0 AND "pointPricePiasters">0 AND "redemptionBps" BETWEEN 1 AND 10000);

DROP TRIGGER retired_stock_posting ON "PointPosting";
DROP FUNCTION reject_retired_stock_posting();
ALTER TABLE "PointAccount" DROP CONSTRAINT point_owner, DROP CONSTRAINT point_nonnegative;
DROP INDEX point_system_singleton;
ALTER TABLE "PointAccount" DROP COLUMN "gymId", DROP COLUMN "branchId";
CREATE TYPE "PointAccountType_new" AS ENUM ('BOOKING_HOLD','ISSUANCE','ARCHIVED','TRAINEE_WALLET','REDEEMED','EXPIRED');
ALTER TABLE "PointAccount" ALTER COLUMN type TYPE "PointAccountType_new" USING
 (CASE WHEN type::text IN ('GYM_INVENTORY','BRANCH_INVENTORY') THEN 'ARCHIVED' ELSE type::text END)::"PointAccountType_new";
DROP TYPE "PointAccountType";
ALTER TYPE "PointAccountType_new" RENAME TO "PointAccountType";
ALTER TABLE "PointAccount" ADD CONSTRAINT point_owner CHECK (
 (type IN ('TRAINEE_WALLET','BOOKING_HOLD') AND "ownerUserId" IS NOT NULL AND (type<>'BOOKING_HOLD' OR "expiresAt" IS NULL)) OR
 (type IN ('ISSUANCE','REDEEMED','EXPIRED','ARCHIVED') AND "ownerUserId" IS NULL AND "expiresAt" IS NULL));
ALTER TABLE "PointAccount" ADD CONSTRAINT point_nonnegative CHECK(type='ISSUANCE' OR balance>=0);
CREATE UNIQUE INDEX point_system_singleton ON "PointAccount"(type) WHERE type IN ('ISSUANCE','REDEEMED','EXPIRED');
CREATE OR REPLACE FUNCTION point_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.type='ARCHIVED' OR (TG_OP='UPDATE' AND OLD.type='ARCHIVED') THEN RAISE EXCEPTION 'Archived accounts are frozen' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.balance<>0 THEN RAISE EXCEPTION 'Accounts must start at zero' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.type IS DISTINCT FROM OLD.type OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId") THEN RAISE EXCEPTION 'Immutable account identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION reject_archived_account_posting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "PointAccount" WHERE id=NEW."accountId" AND type='ARCHIVED') THEN RAISE EXCEPTION 'Archived accounts are frozen' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER archived_account_posting_guard BEFORE INSERT ON "PointPosting" FOR EACH ROW EXECUTE FUNCTION reject_archived_account_posting();
ALTER TYPE "PointTxKind" RENAME VALUE 'SALE_REVERSAL' TO 'HISTORICAL_REVERSAL';

ALTER TABLE "PointDispatch" DROP CONSTRAINT dispatch_target, DROP CONSTRAINT dispatch_values, DROP COLUMN "gymId", DROP COLUMN "branchId";
ALTER TABLE "PointDispatch" ADD CONSTRAINT dispatch_values CHECK (
 kind='ADMIN_TOPUP' AND points>0 AND "chargePiasters">0 AND "unitPricePiasters">0 AND "discountBps"=0 AND "pricingVersion">0
 AND "chargePiasters"=ceil(points::numeric*"unitPricePiasters") AND length("phoneLast4")=4 AND length("requestHash")=64
 AND "paymentMethod" IN ('CASH','INSTAPAY','WALLET') AND "paymentReference" IS NOT NULL);
CREATE OR REPLACE FUNCTION check_point_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE legs integer; good integer; BEGIN
 IF NEW.kind<>'ADMIN_TOPUP' OR NOT EXISTS(SELECT 1 FROM "PointTransaction" t WHERE t.id=NEW."pointTransactionId" AND t.posted AND t."referenceId"=NEW.id AND t."actorId"=NEW."actorId" AND t.kind='ISSUE') THEN RAISE EXCEPTION 'Missing dispatch ledger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "PricingPolicy" p WHERE p.id=NEW."policyId" AND p.version=NEW."pricingVersion" AND p."pointPricePiasters"=NEW."unitPricePiasters") THEN RAISE EXCEPTION 'Invalid dispatch policy'; END IF;
 SELECT count(*) INTO legs FROM "PointPosting" WHERE "transactionId"=NEW."pointTransactionId";
 SELECT count(*) INTO good FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND p.delta=NEW.points AND a.type='TRAINEE_WALLET' AND a."ownerUserId"=NEW."recipientId";
 IF good<>1 OR legs<>2 OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."actorId" AND role='PLATFORM_ADMIN')
 OR NOT EXISTS(SELECT 1 FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND a.type='ISSUANCE' AND p.delta=-NEW.points)
 THEN RAISE EXCEPTION 'Invalid platform topup'; END IF;
 RETURN NULL;
END $$;

-- Sealed snapshots are not operational data and cannot be rewritten or removed.
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON "FinancialArchiveRecord" FROM %I',r);
 EXECUTE format('GRANT SELECT ON "FinancialArchiveRecord" TO %I',r);
 END IF;
END LOOP; END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "FinancialArchiveRecord" r JOIN "PointAccount" a ON a.id=r."recordId" WHERE r."recordType"='POINT_ACCOUNT' AND (a.balance<>r.points OR a.type<>'ARCHIVED'))
 THEN RAISE EXCEPTION 'Archived balance mismatch'; END IF;
END $$;

-- Remove the retired capability from stored delegation grants as well.
INSERT INTO "FinancialArchiveRecord" SELECT gen_random_uuid(),'DELEGATION',d.id,ARRAY[d."userId",d."grantedById"],false,0,0,to_jsonb(d),CURRENT_TIMESTAMP FROM "StaffDelegation" d WHERE 'TRANSFER_STOCK'=ANY(d.permissions);
UPDATE "StaffDelegation" SET permissions=array_remove(permissions,'TRANSFER_STOCK') WHERE 'TRANSFER_STOCK'=ANY(permissions);
ALTER TABLE "StaffDelegation" DROP CONSTRAINT "StaffDelegation_check";
ALTER TABLE "StaffDelegation" ADD CONSTRAINT delegation_permissions CHECK(version>0 AND permissions <@ ARRAY['MANAGE_CASHIERS','EDIT_BRANCH','REQUEST_PRICING','REQUEST_WITHDRAWAL']::text[]);

CREATE TRIGGER financial_archive_immutable BEFORE INSERT OR UPDATE OR DELETE ON "FinancialArchiveRecord" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
