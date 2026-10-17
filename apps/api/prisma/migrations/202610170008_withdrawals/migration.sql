-- Skeleton withdrawals cannot be given imaginary historical reservation entries.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "WithdrawalRequest") THEN
  RAISE EXCEPTION 'Reconcile legacy withdrawal requests before this migration'; END IF; END $$;
ALTER TYPE "WithdrawalStatus" ADD VALUE 'CANCELLED';
CREATE TABLE "WithdrawalCalendar" (
  id UUID PRIMARY KEY, version INTEGER NOT NULL UNIQUE CHECK(version>0),
  workdays INTEGER[] NOT NULL CHECK(cardinality(workdays) BETWEEN 1 AND 7 AND workdays <@ ARRAY[1,2,3,4,5,6,7]),
  holidays TEXT[] NOT NULL CHECK(cardinality(holidays)<=500), "countAcceptanceDay" BOOLEAN NOT NULL,
  "deadlineHour" INTEGER NOT NULL CHECK("deadlineHour" BETWEEN 0 AND 23), "deadlineMinute" INTEGER NOT NULL CHECK("deadlineMinute" BETWEEN 0 AND 59),
  "createdById" UUID NOT NULL REFERENCES "User"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER withdrawal_calendar_immutable BEFORE UPDATE OR DELETE ON "WithdrawalCalendar" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
ALTER TABLE "WithdrawalRequest"
 ADD COLUMN "requestorId" UUID NOT NULL REFERENCES "User"(id),
 ADD COLUMN "idempotencyKey" TEXT NOT NULL UNIQUE,
 ADD COLUMN "requestHash" TEXT NOT NULL CHECK(length("requestHash")=64),
 ADD COLUMN "paymentMethod" "PaymentMethodType" NOT NULL,
 ADD COLUMN "destinationAccount" TEXT NOT NULL CHECK(length("destinationAccount") BETWEEN 3 AND 150),
 ADD COLUMN "destinationName" TEXT NOT NULL CHECK(length("destinationName") BETWEEN 2 AND 150),
 ADD COLUMN "reserveTransactionId" UUID NOT NULL UNIQUE REFERENCES "MoneyTransaction"(id),
 ADD COLUMN "releaseTransactionId" UUID UNIQUE REFERENCES "MoneyTransaction"(id),
 ADD COLUMN "paymentTransactionId" UUID UNIQUE REFERENCES "MoneyTransaction"(id),
 ADD COLUMN "calendarId" UUID REFERENCES "WithdrawalCalendar"(id),
 ADD COLUMN "dueAt" TIMESTAMP(3), ADD COLUMN "reviewReason" TEXT,
 ADD COLUMN "closedAt" TIMESTAMP(3), ADD COLUMN "closedById" UUID REFERENCES "User"(id),
 ADD COLUMN "paidById" UUID REFERENCES "User"(id),
 ADD COLUMN "proofReceiptId" UUID UNIQUE REFERENCES "ReceiptEvidence"(id),
 ADD COLUMN "transferReference" TEXT UNIQUE, ADD COLUMN "delayReason" TEXT,
 ADD CONSTRAINT withdrawal_gym_scope CHECK("branchId" IS NULL AND "transferProofKey" IS NULL),
 ADD CONSTRAINT withdrawal_review_actor FOREIGN KEY("reviewedById") REFERENCES "User"(id),
 ADD CONSTRAINT withdrawal_accept_metadata CHECK(
  ("acceptedAt" IS NULL AND "dueAt" IS NULL AND "calendarId" IS NULL AND "reviewedById" IS NULL AND "reviewReason" IS NULL) OR
  ("acceptedAt" IS NOT NULL AND "dueAt" IS NOT NULL AND "dueAt">"acceptedAt" AND "calendarId" IS NOT NULL AND "reviewedById" IS NOT NULL AND "reviewReason" IS NOT NULL AND length("reviewReason") BETWEEN 5 AND 1000)),
 ADD CONSTRAINT withdrawal_close_metadata CHECK(
  ("closedAt" IS NULL AND "closedById" IS NULL AND "rejectionReason" IS NULL AND "releaseTransactionId" IS NULL) OR
  ("closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "rejectionReason" IS NOT NULL AND length("rejectionReason") BETWEEN 5 AND 1000 AND "releaseTransactionId" IS NOT NULL)),
 ADD CONSTRAINT withdrawal_payment_metadata CHECK(
  ("paidAt" IS NULL AND "paidById" IS NULL AND "proofReceiptId" IS NULL AND "transferReference" IS NULL AND "paymentTransactionId" IS NULL AND "delayReason" IS NULL) OR
  ("paidAt" IS NOT NULL AND "paidById" IS NOT NULL AND "proofReceiptId" IS NOT NULL AND "transferReference" IS NOT NULL AND length("transferReference") BETWEEN 3 AND 150 AND "transferReference"=upper(btrim("transferReference")) AND "paymentTransactionId" IS NOT NULL AND ("delayReason" IS NULL OR length("delayReason") BETWEEN 5 AND 1000))),
 ADD CONSTRAINT withdrawal_state_metadata CHECK(
  (status='REQUESTED' AND "acceptedAt" IS NULL AND "paidAt" IS NULL AND "closedAt" IS NULL) OR
  (status='APPROVED' AND "acceptedAt" IS NOT NULL AND "paidAt" IS NULL AND "closedAt" IS NULL) OR
  (status IN ('PAID','DISPUTED') AND "acceptedAt" IS NOT NULL AND "paidAt" IS NOT NULL AND "closedAt" IS NULL) OR
  (status::text IN ('REJECTED','CANCELLED') AND "paidAt" IS NULL AND "closedAt" IS NOT NULL AND (status::text<>'CANCELLED' OR "acceptedAt" IS NULL)));
CREATE TABLE "WithdrawalAction" (
 id UUID PRIMARY KEY, "withdrawalId" UUID NOT NULL REFERENCES "WithdrawalRequest"(id), "actorId" UUID NOT NULL REFERENCES "User"(id),
 kind TEXT NOT NULL CHECK(kind IN ('APPROVE','REJECT','CANCEL','PAY','RECEIVED','DISPUTE')), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 "idempotencyKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL CHECK(length("requestHash")=64), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WithdrawalAction_withdrawalId_createdAt_idx" ON "WithdrawalAction"("withdrawalId","createdAt");
CREATE TRIGGER withdrawal_action_immutable BEFORE UPDATE OR DELETE ON "WithdrawalAction" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE TABLE "WithdrawalFeedback" (
 id UUID PRIMARY KEY, "withdrawalId" UUID NOT NULL UNIQUE REFERENCES "WithdrawalRequest"(id), "actorId" UUID NOT NULL REFERENCES "User"(id),
 kind TEXT NOT NULL CHECK(kind IN ('RECEIVED','DISPUTE')), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER withdrawal_feedback_immutable BEFORE UPDATE OR DELETE ON "WithdrawalFeedback" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE FUNCTION guard_withdrawal_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fields TEXT[];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable withdrawal' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'REQUESTED' THEN RAISE EXCEPTION 'Withdrawal must start requested' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='REQUESTED' AND NEW.status='APPROVED' THEN fields:=ARRAY['status','acceptedAt','dueAt','calendarId','reviewedById','reviewReason'];
 ELSIF OLD.status IN ('REQUESTED','APPROVED') AND NEW.status::text IN ('REJECTED','CANCELLED') THEN fields:=ARRAY['status','closedAt','closedById','rejectionReason','releaseTransactionId'];
 ELSIF OLD.status='APPROVED' AND NEW.status='PAID' THEN fields:=ARRAY['status','paidAt','paidById','proofReceiptId','transferReference','delayReason','paymentTransactionId'];
 ELSIF OLD.status='PAID' AND NEW.status='DISPUTED' THEN fields:=ARRAY['status'];
 ELSE RAISE EXCEPTION 'Invalid withdrawal transition' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-fields) IS DISTINCT FROM (to_jsonb(OLD)-fields) THEN RAISE EXCEPTION 'Immutable withdrawal facts' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER withdrawal_history BEFORE INSERT OR UPDATE OR DELETE ON "WithdrawalRequest" FOR EACH ROW EXECUTE FUNCTION guard_withdrawal_history();
CREATE FUNCTION verify_withdrawal_leg(txid UUID, target UUID, gym UUID, amount BIGINT, txkind "MoneyTxKind", source "MoneyAccountType", destination "MoneyAccountType", actor UUID) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "MoneyTransaction" WHERE id=txid AND posted AND kind=txkind AND "referenceId"=target AND "actorId"=actor) OR
    (SELECT count(*) FROM "MoneyPosting" WHERE "transactionId"=txid)<>2 OR
    NOT EXISTS(SELECT 1 FROM "MoneyPosting" p JOIN "MoneyAccount" a ON a.id=p."accountId" WHERE p."transactionId"=txid AND a.type=source AND a."gymId"=gym AND a."branchId" IS NULL AND p."deltaPiasters"=-amount) OR
    NOT EXISTS(SELECT 1 FROM "MoneyPosting" p JOIN "MoneyAccount" a ON a.id=p."accountId" WHERE p."transactionId"=txid AND a.type=destination AND a."gymId"=gym AND a."branchId" IS NULL AND p."deltaPiasters"=amount) THEN
   RAISE EXCEPTION 'Withdrawal must match exact posted gym ledger leg' USING ERRCODE='23514';
 END IF;
END $$;
CREATE FUNCTION verify_withdrawal_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w "WithdrawalRequest"; f "WithdrawalFeedback";
BEGIN
 IF TG_TABLE_NAME='WithdrawalRequest' THEN SELECT * INTO w FROM "WithdrawalRequest" WHERE id=NEW.id;
 ELSE SELECT * INTO w FROM "WithdrawalRequest" WHERE id=NEW."withdrawalId"; END IF;
 PERFORM verify_withdrawal_leg(w."reserveTransactionId",w.id,w."gymId",w."amountPiasters",'WITHDRAWAL_RESERVE','GYM_AVAILABLE','GYM_RESERVED',w."requestorId");
 IF w."releaseTransactionId" IS NOT NULL THEN PERFORM verify_withdrawal_leg(w."releaseTransactionId",w.id,w."gymId",w."amountPiasters",'WITHDRAWAL_RELEASE','GYM_RESERVED','GYM_AVAILABLE',w."closedById"); END IF;
 IF w."paymentTransactionId" IS NOT NULL THEN
  PERFORM verify_withdrawal_leg(w."paymentTransactionId",w.id,w."gymId",w."amountPiasters",'WITHDRAWAL_PAYMENT','GYM_RESERVED','GYM_PAID',w."paidById");
  IF NOT EXISTS(SELECT 1 FROM "ReceiptEvidence" WHERE id=w."proofReceiptId" AND "ownerUserId"=w."paidById") THEN RAISE EXCEPTION 'Proof owner mismatch' USING ERRCODE='23514'; END IF;
  IF w."paidAt">w."dueAt" AND w."delayReason" IS NULL THEN RAISE EXCEPTION 'Late payment needs reason' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO f FROM "WithdrawalFeedback" WHERE "withdrawalId"=w.id;
 IF (w.status='DISPUTED' AND (f.id IS NULL OR f.kind<>'DISPUTE')) OR (f.id IS NOT NULL AND NOT ((w.status='PAID' AND f.kind='RECEIVED') OR (w.status='DISPUTED' AND f.kind='DISPUTE'))) THEN
  RAISE EXCEPTION 'Withdrawal feedback state mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER withdrawal_state AFTER INSERT OR UPDATE ON "WithdrawalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_withdrawal_state();
CREATE CONSTRAINT TRIGGER withdrawal_feedback_state AFTER INSERT ON "WithdrawalFeedback" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_withdrawal_state();
CREATE TABLE "FinancialEvidenceUse" (
 "receiptId" UUID PRIMARY KEY REFERENCES "ReceiptEvidence"(id),
 "topupId" UUID UNIQUE REFERENCES "TopupRequest"(id),
 "withdrawalId" UUID UNIQUE REFERENCES "WithdrawalRequest"(id),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("topupId" IS NOT NULL)::int+("withdrawalId" IS NOT NULL)::int=1)
);
INSERT INTO "FinancialEvidenceUse"("receiptId","topupId") SELECT "receiptId",id FROM "TopupRequest" WHERE "receiptId" IS NOT NULL;
CREATE TRIGGER financial_evidence_immutable BEFORE UPDATE OR DELETE ON "FinancialEvidenceUse" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE FUNCTION verify_financial_receipt_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proof UUID;
BEGIN
 IF TG_TABLE_NAME='TopupRequest' THEN proof:=NEW."receiptId"; ELSE proof:=NEW."proofReceiptId"; END IF;
 IF proof IS NOT NULL THEN
  IF TG_TABLE_NAME='TopupRequest' THEN
   INSERT INTO "FinancialEvidenceUse"("receiptId","topupId") VALUES(proof,NEW.id) ON CONFLICT ("receiptId") DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM "FinancialEvidenceUse" WHERE "receiptId"=proof AND "topupId"=NEW.id) THEN RAISE EXCEPTION 'Financial evidence already used' USING ERRCODE='23514'; END IF;
  ELSE
   INSERT INTO "FinancialEvidenceUse"("receiptId","withdrawalId") VALUES(proof,NEW.id) ON CONFLICT ("receiptId") DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM "FinancialEvidenceUse" WHERE "receiptId"=proof AND "withdrawalId"=NEW.id) THEN RAISE EXCEPTION 'Financial evidence already used' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER topup_proof_exclusive AFTER INSERT OR UPDATE ON "TopupRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_financial_receipt_usage();
CREATE CONSTRAINT TRIGGER withdrawal_proof_exclusive AFTER INSERT OR UPDATE ON "WithdrawalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_financial_receipt_usage();
