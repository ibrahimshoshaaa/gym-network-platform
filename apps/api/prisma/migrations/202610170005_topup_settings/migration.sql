-- CreateEnum
CREATE TYPE "TopupKind" AS ENUM ('TRAINEE', 'BRANCH_STOCK');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('INSTAPAY', 'WALLET');

-- AlterTable
ALTER TABLE "TopupRequest" ADD COLUMN     "discountBps" INTEGER,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "kind" "TopupKind",
ADD COLUMN     "paymentAccount" TEXT,
ADD COLUMN     "paymentAccountName" TEXT,
ADD COLUMN     "paymentMethodType" "PaymentMethodType",
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "pointTransactionId" UUID,
ADD COLUMN     "policyId" UUID,
ADD COLUMN     "receiptId" UUID,
ADD COLUMN     "redemptionBps" INTEGER,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "unitPricePiasters" BIGINT;

-- CreateTable
CREATE TABLE "PricingPolicy" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "pointPricePiasters" BIGINT NOT NULL,
    "gymDiscountBps" INTEGER NOT NULL,
    "redemptionBps" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" UUID NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "account" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopupPackage" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "TopupKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopupPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptEvidence" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingPolicy_version_key" ON "PricingPolicy"("version");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_type_key" ON "PaymentMethod"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptEvidence_objectKey_key" ON "ReceiptEvidence"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptEvidence_assetId_key" ON "ReceiptEvidence"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptEvidence_contentHash_key" ON "ReceiptEvidence"("contentHash");

-- CreateIndex
CREATE INDEX "ReceiptEvidence_ownerUserId_createdAt_idx" ON "ReceiptEvidence"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TopupRequest_idempotencyKey_key" ON "TopupRequest"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TopupRequest_receiptId_key" ON "TopupRequest"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "TopupRequest_pointTransactionId_key" ON "TopupRequest"("pointTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TopupRequest_paymentReference_key" ON "TopupRequest"("paymentReference");

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_requestorUserId_fkey" FOREIGN KEY ("requestorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PricingPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ReceiptEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_pointTransactionId_fkey" FOREIGN KEY ("pointTransactionId") REFERENCES "PointTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptEvidence" ADD CONSTRAINT "ReceiptEvidence_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Commercial settings are versioned history; no defaults are seeded.
ALTER TABLE "PricingPolicy" ADD CONSTRAINT pricing_policy_valid CHECK (
  version > 0 AND "pointPricePiasters" > 0 AND "gymDiscountBps" BETWEEN 0 AND 9999 AND "redemptionBps" BETWEEN 1 AND 10000);
ALTER TABLE "PricingPolicy" ADD CONSTRAINT pricing_policy_creator FOREIGN KEY ("createdById") REFERENCES "User"(id);
CREATE TRIGGER pricing_policy_immutable BEFORE UPDATE OR DELETE ON "PricingPolicy" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
ALTER TABLE "ReceiptEvidence" ADD CONSTRAINT receipt_valid CHECK (bytes > 0 AND bytes <= 5242880 AND "mimeType" = 'image/jpeg');
CREATE TRIGGER receipt_evidence_immutable BEFORE UPDATE OR DELETE ON "ReceiptEvidence" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
ALTER TABLE "PaymentMethod" ADD CONSTRAINT payment_method_valid CHECK (version > 0 AND length(account) BETWEEN 3 AND 150 AND length("accountName") BETWEEN 2 AND 150);
ALTER TABLE "TopupPackage" ADD CONSTRAINT topup_package_valid CHECK (version > 0 AND points > 0 AND length(label) BETWEEN 1 AND 100);
ALTER TABLE "TopupRequest" ADD CONSTRAINT topup_reviewer FOREIGN KEY ("reviewedById") REFERENCES "User"(id);
ALTER TABLE "TopupRequest" ADD CONSTRAINT topup_snapshot_valid CHECK (kind IS NULL OR (
  "unitPricePiasters" IS NOT NULL AND "discountBps" IS NOT NULL AND "redemptionBps" IS NOT NULL AND points > 0 AND "chargePiasters" > 0 AND "unitPricePiasters" > 0 AND "discountBps" BETWEEN 0 AND 9999 AND "redemptionBps" BETWEEN 1 AND 10000 AND
  "policyId" IS NOT NULL AND "receiptId" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND "requestHash" IS NOT NULL AND
  "paymentMethodType" IS NOT NULL AND "paymentAccount" IS NOT NULL AND "paymentAccountName" IS NOT NULL AND
  ((kind = 'TRAINEE' AND "receivingBranchId" IS NULL AND "discountBps" = 0) OR (kind = 'BRANCH_STOCK' AND "receivingBranchId" IS NOT NULL)) AND
  ((status = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL AND "pointTransactionId" IS NULL AND "paymentReference" IS NULL) OR
   (status = 'REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length("reviewReason") > 0 AND "pointTransactionId" IS NULL AND "paymentReference" IS NULL) OR
   (status = 'APPROVED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length("reviewReason") > 0 AND "pointTransactionId" IS NOT NULL AND "paymentReference" IS NOT NULL))));
CREATE FUNCTION guard_topup_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind IS NULL OR NEW.status <> 'PENDING' THEN RAISE EXCEPTION 'New topups require a pending snapshot' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR OLD.status <> 'PENDING' THEN RAISE EXCEPTION 'Immutable topup history' USING ERRCODE = '23514'; END IF;
  IF NEW.status = 'PENDING' OR
     (to_jsonb(NEW) - ARRAY['status','reviewedById','reviewedAt','reviewReason','paymentReference','pointTransactionId']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','reviewedById','reviewedAt','reviewReason','paymentReference','pointTransactionId']) THEN
    RAISE EXCEPTION 'Topup snapshot cannot change' USING ERRCODE = '23514';
  END IF;
  IF OLD.kind IS NULL AND NEW.status <> 'REJECTED' THEN RAISE EXCEPTION 'Legacy topup requires separate reconciliation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER topup_history BEFORE INSERT OR UPDATE OR DELETE ON "TopupRequest" FOR EACH ROW EXECUTE FUNCTION guard_topup_history();
