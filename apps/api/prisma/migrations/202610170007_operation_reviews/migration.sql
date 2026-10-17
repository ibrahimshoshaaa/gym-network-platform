CREATE TYPE "OperationReviewKind" AS ENUM ('VISIT_CANCEL','SALE_CORRECTION');
CREATE TABLE "OperationReview" (
  id UUID PRIMARY KEY, kind "OperationReviewKind" NOT NULL,
  "visitId" UUID UNIQUE REFERENCES "Visit"(id), "saleId" UUID UNIQUE REFERENCES "PointSale"(id),
  "branchId" UUID NOT NULL REFERENCES "Branch"(id), "requestorId" UUID NOT NULL REFERENCES "User"(id),
  reason TEXT NOT NULL, "evidenceText" TEXT NOT NULL, "evidenceId" UUID REFERENCES "ReceiptEvidence"(id),
  status "RequestStatus" NOT NULL DEFAULT 'PENDING', "idempotencyKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
  "reviewedById" UUID REFERENCES "User"(id), "reviewReason" TEXT, "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT review_target CHECK ((kind='VISIT_CANCEL' AND "visitId" IS NOT NULL AND "saleId" IS NULL) OR (kind='SALE_CORRECTION' AND "saleId" IS NOT NULL AND "visitId" IS NULL)),
  CONSTRAINT review_values CHECK (length(reason) BETWEEN 5 AND 1000 AND length("evidenceText") BETWEEN 10 AND 2000 AND length("requestHash")=64),
  CONSTRAINT review_state CHECK ((status='PENDING' AND "reviewedById" IS NULL AND "reviewReason" IS NULL AND "reviewedAt" IS NULL) OR (status IN ('APPROVED','REJECTED') AND "reviewedById" IS NOT NULL AND "reviewReason" IS NOT NULL AND length("reviewReason") BETWEEN 5 AND 1000 AND "reviewedAt" IS NOT NULL)),
  -- Sale refund responsibility is an open business decision: fail closed.
  CONSTRAINT sale_refund_policy_pending CHECK (kind<>'SALE_CORRECTION' OR status<>'APPROVED')
);
CREATE INDEX "OperationReview_requestorId_createdAt_idx" ON "OperationReview"("requestorId","createdAt");
CREATE INDEX "OperationReview_status_createdAt_idx" ON "OperationReview"(status,"createdAt");
CREATE TABLE "VisitCancellation" (
  id UUID PRIMARY KEY, "visitId" UUID NOT NULL UNIQUE REFERENCES "Visit"(id), "actorId" UUID NOT NULL REFERENCES "User"(id),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000), "reviewId" UUID UNIQUE REFERENCES "OperationReview"(id),
  "idempotencyKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL CHECK(length("requestHash")=64),
  "pointTransactionId" UUID NOT NULL UNIQUE REFERENCES "PointTransaction"(id),
  "moneyTransactionId" UUID NOT NULL UNIQUE REFERENCES "MoneyTransaction"(id),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER cancellation_immutable BEFORE UPDATE OR DELETE ON "VisitCancellation" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
ALTER TABLE "Visit" ADD CONSTRAINT cancellation_actor_fk FOREIGN KEY ("cancelledById") REFERENCES "User"(id),
  ADD CONSTRAINT visit_cancel_metadata CHECK ((status='CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL AND "cancellationReason" IS NOT NULL AND length("cancellationReason") BETWEEN 5 AND 1000) OR (status<>'CANCELLED' AND "cancelledAt" IS NULL AND "cancelledById" IS NULL AND "cancellationReason" IS NULL));
CREATE FUNCTION guard_operation_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_branch UUID;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable operation review' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'PENDING' THEN RAISE EXCEPTION 'Review must start pending' USING ERRCODE='23514'; END IF;
    IF NEW.kind='VISIT_CANCEL' THEN SELECT "branchId" INTO target_branch FROM "Visit" WHERE id=NEW."visitId";
    ELSE SELECT "branchId" INTO target_branch FROM "PointSale" WHERE id=NEW."saleId"; END IF;
    IF target_branch IS DISTINCT FROM NEW."branchId" THEN RAISE EXCEPTION 'Review target mismatch' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR
      (to_jsonb(NEW)-ARRAY['status','reviewedById','reviewReason','reviewedAt']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['status','reviewedById','reviewReason','reviewedAt']) THEN
      RAISE EXCEPTION 'Immutable review facts or decision' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operation_review_guard BEFORE INSERT OR UPDATE OR DELETE ON "OperationReview" FOR EACH ROW EXECUTE FUNCTION guard_operation_review();
-- Deferred checks let the service atomically post both legs, write the receipt,
-- change the visit and complete the admin review in whichever order it needs.
CREATE FUNCTION verify_visit_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v "Visit"; c "VisitCancellation"; p "PointTransaction"; m "MoneyTransaction"; r "OperationReview";
BEGIN
  IF TG_TABLE_NAME='Visit' THEN SELECT * INTO v FROM "Visit" WHERE id=NEW.id;
  ELSIF TG_TABLE_NAME='OperationReview' THEN SELECT * INTO v FROM "Visit" WHERE id=NEW."visitId";
  ELSE SELECT * INTO v FROM "Visit" WHERE id=NEW."visitId"; END IF;
  IF v.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM "VisitCancellation" WHERE "visitId"=v.id;
  IF v.status<>'CANCELLED' AND c.id IS NULL THEN RETURN NULL; END IF;
  IF v.status<>'CANCELLED' OR c.id IS NULL OR c."actorId" IS DISTINCT FROM v."cancelledById" OR c.reason IS DISTINCT FROM v."cancellationReason" THEN
    RAISE EXCEPTION 'Cancellation must accompany visit reversal' USING ERRCODE='23514';
  END IF;
  SELECT * INTO p FROM "PointTransaction" WHERE id=c."pointTransactionId";
  SELECT * INTO m FROM "MoneyTransaction" WHERE id=c."moneyTransactionId";
  IF NOT p.posted OR NOT m.posted OR p.kind<>'VISIT_REVERSAL' OR m.kind<>'VISIT_REVERSAL' OR
    p."reversalOfId" IS DISTINCT FROM v."pointTransactionId" OR m."reversalOfId" IS DISTINCT FROM v."moneyTransactionId" OR
    p."actorId" IS DISTINCT FROM c."actorId" OR m."actorId" IS DISTINCT FROM c."actorId" OR
    p."referenceId" IS DISTINCT FROM c.id OR m."referenceId" IS DISTINCT FROM c.id THEN
    RAISE EXCEPTION 'Cancellation must reverse both original transactions' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM (
    SELECT "accountId",sum(delta)::bigint AS amount FROM "PointPosting" WHERE "transactionId"=v."pointTransactionId" GROUP BY "accountId"
  ) a FULL JOIN (
    SELECT "accountId",sum(delta)::bigint AS amount FROM "PointPosting" WHERE "transactionId"=p.id GROUP BY "accountId"
  ) b USING ("accountId") WHERE coalesce(a.amount,0)+coalesce(b.amount,0)<>0) OR EXISTS (SELECT 1 FROM (
    SELECT "accountId",sum("deltaPiasters") AS amount FROM "MoneyPosting" WHERE "transactionId"=v."moneyTransactionId" GROUP BY "accountId"
  ) a FULL JOIN (
    SELECT "accountId",sum("deltaPiasters") AS amount FROM "MoneyPosting" WHERE "transactionId"=m.id GROUP BY "accountId"
  ) b USING ("accountId") WHERE coalesce(a.amount,0)+coalesce(b.amount,0)<>0) THEN
    RAISE EXCEPTION 'Cancellation amounts must exactly reverse originals' USING ERRCODE='23514';
  END IF;
  IF c."reviewId" IS NOT NULL THEN
    SELECT * INTO r FROM "OperationReview" WHERE id=c."reviewId";
    IF r.status<>'APPROVED' OR r."visitId" IS DISTINCT FROM v.id OR r."reviewedById" IS DISTINCT FROM c."actorId" THEN
      RAISE EXCEPTION 'Cancellation approval mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER visit_cancel_pair AFTER INSERT OR UPDATE ON "Visit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_visit_cancellation();
CREATE CONSTRAINT TRIGGER cancellation_pair AFTER INSERT ON "VisitCancellation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_visit_cancellation();
CREATE CONSTRAINT TRIGGER review_cancel_pair AFTER UPDATE ON "OperationReview" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_visit_cancellation();
-- An approved review must point to its own immutable cancellation receipt.
CREATE FUNCTION verify_review_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM "VisitCancellation" WHERE "reviewId"=NEW.id AND "visitId"=NEW."visitId") THEN
    RAISE EXCEPTION 'Approved review requires cancellation' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER review_approval_pair AFTER UPDATE ON "OperationReview" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_review_approval();
