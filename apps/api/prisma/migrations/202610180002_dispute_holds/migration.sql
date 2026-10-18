-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MoneyTxKind" ADD VALUE 'DISPUTE_HOLD';

ALTER TYPE "MoneyTxKind" ADD VALUE 'DISPUTE_RELEASE';

-- CreateTable
CREATE TABLE "FinancialHold" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "amountPiasters" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holdTransactionId" UUID NOT NULL,
    "releaseTransactionId" UUID,
    "releasedById" UUID,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "releaseKey" TEXT,

    CONSTRAINT "FinancialHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialHold_holdTransactionId_key" ON "FinancialHold"("holdTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialHold_releaseTransactionId_key" ON "FinancialHold"("releaseTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialHold_idempotencyKey_key" ON "FinancialHold"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialHold_releaseKey_key" ON "FinancialHold"("releaseKey");

-- CreateIndex
CREATE INDEX "FinancialHold_gymId_state_createdAt_idx" ON "FinancialHold"("gymId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialHold_visitId_idx" ON "FinancialHold"("visitId");

ALTER TABLE "FinancialHold" ADD CONSTRAINT "FinancialHold_amount_check" CHECK ("amountPiasters">0);
ALTER TABLE "FinancialHold" ADD CONSTRAINT "FinancialHold_state_check" CHECK ((state='OPEN' AND "releaseTransactionId" IS NULL AND "releasedAt" IS NULL AND "releasedById" IS NULL AND "releaseReason" IS NULL AND "releaseKey" IS NULL) OR (state='RELEASED' AND "releaseTransactionId" IS NOT NULL AND "releasedAt" IS NOT NULL AND "releasedById" IS NOT NULL AND length(btrim("releaseReason"))>=5 AND "releaseKey" IS NOT NULL));
ALTER TABLE "FinancialHold" ADD FOREIGN KEY ("gymId") REFERENCES "Gym"(id);
ALTER TABLE "FinancialHold" ADD FOREIGN KEY ("visitId") REFERENCES "Visit"(id);
ALTER TABLE "FinancialHold" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id);
ALTER TABLE "FinancialHold" ADD FOREIGN KEY ("releasedById") REFERENCES "User"(id);
ALTER TABLE "FinancialHold" ADD FOREIGN KEY ("holdTransactionId") REFERENCES "MoneyTransaction"(id);
ALTER TABLE "FinancialHold" ADD FOREIGN KEY ("releaseTransactionId") REFERENCES "MoneyTransaction"(id);
CREATE FUNCTION protect_financial_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial hold history is immutable'; END IF;
 IF OLD.state<>'OPEN' OR NEW.state<>'RELEASED' OR
  (NEW.id,NEW."gymId",NEW."visitId",NEW."amountPiasters",NEW.reason,NEW."createdById",NEW."createdAt",NEW."holdTransactionId",NEW."idempotencyKey",NEW."requestHash") IS DISTINCT FROM
  (OLD.id,OLD."gymId",OLD."visitId",OLD."amountPiasters",OLD.reason,OLD."createdById",OLD."createdAt",OLD."holdTransactionId",OLD."idempotencyKey",OLD."requestHash") THEN RAISE EXCEPTION 'Only documented hold release is allowed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FinancialHold_immutable" BEFORE UPDATE OR DELETE ON "FinancialHold" FOR EACH ROW EXECUTE FUNCTION protect_financial_hold();
CREATE FUNCTION check_financial_hold() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE h "FinancialHold"; c integer; BEGIN
 SELECT * INTO h FROM "FinancialHold" WHERE id=NEW.id;
 IF NOT EXISTS(SELECT 1 FROM "Visit" v JOIN "Branch" b ON b.id=v."branchId" WHERE v.id=h."visitId" AND b."gymId"=h."gymId" AND v."settlementPiasters">=h."amountPiasters" AND (h.state<>'OPEN' OR v.status<>'CANCELLED') AND v."settlementPiasters">=(SELECT coalesce(sum("amountPiasters"),0) FROM "FinancialHold" WHERE "visitId"=h."visitId" AND state='OPEN')) THEN RAISE EXCEPTION 'Hold must belong to a real visit entitlement'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "MoneyTransaction" t WHERE t.id=h."holdTransactionId" AND t.posted AND t.kind::text='DISPUTE_HOLD' AND t."referenceId"=h.id AND t."actorId"=h."createdById") THEN RAISE EXCEPTION 'Missing posted hold transaction'; END IF;
 SELECT count(*) INTO c FROM "MoneyPosting" p JOIN "MoneyAccount" a ON a.id=p."accountId" WHERE p."transactionId"=h."holdTransactionId" AND a."gymId"=h."gymId" AND a."branchId" IS NULL AND ((a.type='GYM_AVAILABLE' AND p."deltaPiasters"=-h."amountPiasters") OR (a.type='GYM_DISPUTED' AND p."deltaPiasters"=h."amountPiasters"));
 IF c<>2 OR (SELECT count(*) FROM "MoneyPosting" WHERE "transactionId"=h."holdTransactionId")<>2 THEN RAISE EXCEPTION 'Invalid hold legs'; END IF;
 IF h.state='RELEASED' THEN
  IF NOT EXISTS(SELECT 1 FROM "MoneyTransaction" t WHERE t.id=h."releaseTransactionId" AND t.posted AND t.kind::text='DISPUTE_RELEASE' AND t."referenceId"=h.id AND t."actorId"=h."releasedById") THEN RAISE EXCEPTION 'Missing posted release transaction'; END IF;
  SELECT count(*) INTO c FROM "MoneyPosting" p JOIN "MoneyAccount" a ON a.id=p."accountId" WHERE p."transactionId"=h."releaseTransactionId" AND a."gymId"=h."gymId" AND a."branchId" IS NULL AND ((a.type='GYM_DISPUTED' AND p."deltaPiasters"=-h."amountPiasters") OR (a.type='GYM_AVAILABLE' AND p."deltaPiasters"=h."amountPiasters"));
  IF c<>2 OR (SELECT count(*) FROM "MoneyPosting" WHERE "transactionId"=h."releaseTransactionId")<>2 THEN RAISE EXCEPTION 'Invalid release legs'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "FinancialHold_money_guard" AFTER INSERT OR UPDATE ON "FinancialHold" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_financial_hold();
CREATE FUNCTION check_disputed_balance() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE balance bigint; held bigint; BEGIN
 IF NEW.type<>'GYM_DISPUTED' THEN RETURN NULL; END IF;
 SELECT "balancePiasters" INTO balance FROM "MoneyAccount" WHERE id=NEW.id;
 SELECT coalesce(sum("amountPiasters"),0) INTO held FROM "FinancialHold" WHERE "gymId"=NEW."gymId" AND state='OPEN';
 IF balance<>held THEN RAISE EXCEPTION 'Disputed balance must equal open holds'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "MoneyAccount_disputed_guard" AFTER INSERT OR UPDATE ON "MoneyAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_disputed_balance();
CREATE FUNCTION protect_held_visit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='CANCELLED' AND EXISTS(SELECT 1 FROM "FinancialHold" WHERE "visitId"=NEW.id AND state='OPEN') THEN RAISE EXCEPTION 'Resolve open holds before cancelling visit'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "Visit_open_hold_guard" BEFORE UPDATE ON "Visit" FOR EACH ROW EXECUTE FUNCTION protect_held_visit();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON "FinancialHold" TO gym_api_service; END IF; END $$;
