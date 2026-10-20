-- Existing branch balances and immutable postings remain untouched.
ALTER TABLE "PointAccount" ADD COLUMN "gymId" UUID REFERENCES "Gym"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "PointAccount_type_gymId_key" ON "PointAccount"(type,"gymId");
ALTER TABLE "PointAccount" DROP CONSTRAINT point_owner;
ALTER TABLE "PointAccount" ADD CONSTRAINT point_owner CHECK (
 (type='GYM_INVENTORY' AND "gymId" IS NOT NULL AND "branchId" IS NULL AND "ownerUserId" IS NULL AND "expiresAt" IS NULL) OR
 (type='TRAINEE_WALLET' AND "ownerUserId" IS NOT NULL AND "branchId" IS NULL AND "gymId" IS NULL) OR
 (type='BRANCH_INVENTORY' AND "branchId" IS NOT NULL AND "ownerUserId" IS NULL AND "gymId" IS NULL AND "expiresAt" IS NULL) OR
 (type IN ('ISSUANCE','REDEEMED','EXPIRED') AND "ownerUserId" IS NULL AND "branchId" IS NULL AND "gymId" IS NULL AND "expiresAt" IS NULL));
CREATE OR REPLACE FUNCTION point_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.balance<>0 THEN RAISE EXCEPTION 'Accounts must start at zero' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.type IS DISTINCT FROM OLD.type OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId" OR NEW."gymId" IS DISTINCT FROM OLD."gymId") THEN RAISE EXCEPTION 'Immutable account identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE "TopupRequest" ADD COLUMN "receivingGymId" UUID REFERENCES "Gym"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TopupRequest" DROP CONSTRAINT topup_snapshot_valid;
ALTER TABLE "TopupRequest" ADD CONSTRAINT topup_snapshot_valid CHECK (kind IS NULL OR (
  "unitPricePiasters" IS NOT NULL AND "discountBps" IS NOT NULL AND "redemptionBps" IS NOT NULL AND points > 0 AND "chargePiasters" > 0 AND "unitPricePiasters" > 0 AND "discountBps" BETWEEN 0 AND 9999 AND "redemptionBps" BETWEEN 1 AND 10000 AND
  "policyId" IS NOT NULL AND "receiptId" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND "requestHash" IS NOT NULL AND
  "paymentMethodType" IS NOT NULL AND "paymentAccount" IS NOT NULL AND "paymentAccountName" IS NOT NULL AND
  ((kind = 'TRAINEE' AND "receivingBranchId" IS NULL AND "receivingGymId" IS NULL AND "discountBps" = 0) OR (kind = 'BRANCH_STOCK' AND (("receivingBranchId" IS NOT NULL)::int + ("receivingGymId" IS NOT NULL)::int = 1))) AND
  ((status = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL AND "pointTransactionId" IS NULL AND "paymentReference" IS NULL) OR
   (status = 'REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length("reviewReason") > 0 AND "pointTransactionId" IS NULL AND "paymentReference" IS NULL) OR
   (status = 'APPROVED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length("reviewReason") > 0 AND "pointTransactionId" IS NOT NULL AND "paymentReference" IS NOT NULL))));

