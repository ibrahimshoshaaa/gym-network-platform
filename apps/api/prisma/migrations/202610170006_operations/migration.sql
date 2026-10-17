-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "branchPricingVersion" INTEGER,
ADD COLUMN     "policyId" UUID,
ADD COLUMN     "redemptionBps" INTEGER,
ADD COLUMN     "unitPricePiasters" BIGINT;

-- CreateTable
CREATE TABLE "PointSale" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "traineeId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "traineeLabel" TEXT NOT NULL,
    "phoneLast4" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "chargePiasters" BIGINT NOT NULL,
    "unitPricePiasters" BIGINT NOT NULL,
    "policyId" UUID NOT NULL,
    "pricingVersion" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "pointTransactionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrTicket" (
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "visitId" UUID,

    CONSTRAINT "QrTicket_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "VisitEntry" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "alreadyActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointSale_idempotencyKey_key" ON "PointSale"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PointSale_pointTransactionId_key" ON "PointSale"("pointTransactionId");

-- CreateIndex
CREATE INDEX "PointSale_branchId_createdAt_idx" ON "PointSale"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "PointSale_traineeId_createdAt_idx" ON "PointSale"("traineeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QrTicket_tokenHash_key" ON "QrTicket"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "VisitEntry_idempotencyKey_key" ON "VisitEntry"("idempotencyKey");


-- Approved O01: monetary accounts are consolidated per gym. Never silently
-- migrate any existing branch-scoped balances; this check requires reconciliation.
ALTER TABLE "MoneyAccount" ADD CONSTRAINT money_gym_consolidated CHECK ("branchId" IS NULL);
ALTER TABLE "PointSale" ADD CONSTRAINT sale_branch_fk FOREIGN KEY ("branchId") REFERENCES "Branch"(id), ADD CONSTRAINT sale_trainee_fk FOREIGN KEY ("traineeId") REFERENCES "User"(id), ADD CONSTRAINT sale_cashier_fk FOREIGN KEY ("cashierId") REFERENCES "User"(id), ADD CONSTRAINT sale_policy_fk FOREIGN KEY ("policyId") REFERENCES "PricingPolicy"(id), ADD CONSTRAINT sale_point_tx_fk FOREIGN KEY ("pointTransactionId") REFERENCES "PointTransaction"(id), ADD CONSTRAINT sale_values CHECK (points>0 AND "unitPricePiasters">0 AND "chargePiasters"=points::numeric*"unitPricePiasters" AND "pricingVersion">0 AND length("phoneLast4")=4 AND length("requestHash")=64);
CREATE TRIGGER sale_immutable BEFORE UPDATE OR DELETE ON "PointSale" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
ALTER TABLE "QrTicket" ADD CONSTRAINT qr_user_fk FOREIGN KEY ("userId") REFERENCES "User"(id), ADD CONSTRAINT qr_session_fk FOREIGN KEY ("sessionId") REFERENCES "AuthSession"(id), ADD CONSTRAINT qr_visit_fk FOREIGN KEY ("visitId") REFERENCES "Visit"(id), ADD CONSTRAINT qr_consumption CHECK (("consumedAt" IS NULL)=("visitId" IS NULL));
ALTER TABLE "VisitEntry" ADD CONSTRAINT entry_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id), ADD CONSTRAINT entry_branch_fk FOREIGN KEY ("branchId") REFERENCES "Branch"(id), ADD CONSTRAINT entry_visit_fk FOREIGN KEY ("visitId") REFERENCES "Visit"(id), ADD CONSTRAINT entry_hash CHECK(length("requestHash")=64);
CREATE TRIGGER entry_immutable BEFORE UPDATE OR DELETE ON "VisitEntry" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
ALTER TABLE "Visit" ADD CONSTRAINT visit_policy_fk FOREIGN KEY ("policyId") REFERENCES "PricingPolicy"(id), ADD CONSTRAINT visit_policy_snapshot CHECK ("policyId" IS NULL OR ("unitPricePiasters" IS NOT NULL AND "unitPricePiasters">0 AND "redemptionBps" IS NOT NULL AND "redemptionBps" BETWEEN 1 AND 10000 AND "branchPricingVersion" IS NOT NULL AND "branchPricingVersion">0 AND "settlementPiasters"=ceil("pointsCharged"::numeric*"unitPricePiasters"*"redemptionBps"/10000)));
CREATE FUNCTION guard_visit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','cancelledAt','cancelledById','cancellationReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','cancelledAt','cancelledById','cancellationReason']) THEN
    RAISE EXCEPTION 'Immutable visit facts' USING ERRCODE='23514';
  END IF;
  IF OLD.status='CANCELLED' OR (OLD.status='EXPIRED' AND NEW.status='ACTIVE') THEN RAISE EXCEPTION 'Invalid visit transition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_history BEFORE UPDATE OR DELETE ON "Visit" FOR EACH ROW EXECUTE FUNCTION guard_visit_history();
