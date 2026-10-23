-- Service collections remain immutable. A full reversal receipt reopens the
-- charge when a visit must be cancelled after automatic fee collection.
CREATE TABLE "GymChargeCollectionReversal" (
 id UUID PRIMARY KEY,
 "collectionId" UUID NOT NULL UNIQUE REFERENCES "GymChargeCollection"(id),
 "visitId" UUID NOT NULL REFERENCES "Visit"(id),
 "moneyTransactionId" UUID NOT NULL UNIQUE REFERENCES "MoneyTransaction"(id),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GymChargeCollectionReversal_visitId_idx" ON "GymChargeCollectionReversal"("visitId");
CREATE TRIGGER service_refund_immutable BEFORE UPDATE OR DELETE ON "GymChargeCollectionReversal" FOR EACH ROW EXECUTE FUNCTION immutable_service_collection();

CREATE OR REPLACE FUNCTION verify_service_collection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "GymServiceCharge"; n BIGINT; legs INT;
BEGIN
 SELECT * INTO c FROM "GymServiceCharge" WHERE id=NEW."chargeId" FOR UPDATE;
 IF c."gymId"<>NEW."gymId" OR c."voidedAt" IS NOT NULL OR c."dueAt">clock_timestamp() THEN RAISE EXCEPTION 'Invalid charge collection'; END IF;
 SELECT coalesce(sum(p."amountPiasters"),0) INTO n FROM "GymChargeCollection" p WHERE p."chargeId"=c.id AND NOT EXISTS(SELECT 1 FROM "GymChargeCollectionReversal" r WHERE r."collectionId"=p.id);
 IF n>c."amountPiasters" THEN RAISE EXCEPTION 'Charge overcollection'; END IF;
 SELECT count(*) INTO legs FROM "MoneyPosting" p JOIN "MoneyAccount" a ON a.id=p."accountId" JOIN "MoneyTransaction" t ON t.id=p."transactionId"
 WHERE t.id=NEW."moneyTransactionId" AND t.posted AND t.kind='ADJUSTMENT' AND t."referenceId"=c."sourceId" AND a."branchId" IS NULL
 AND ((a.type='GYM_AVAILABLE' AND a."gymId"=c."gymId" AND p."deltaPiasters"=-NEW."amountPiasters") OR (a.type='PLATFORM_OFFSET' AND a."gymId" IS NULL AND p."deltaPiasters"=NEW."amountPiasters"));
 IF legs<>2 OR (SELECT count(*) FROM "MoneyPosting" WHERE "transactionId"=NEW."moneyTransactionId")<>2 THEN RAISE EXCEPTION 'Collection ledger mismatch'; END IF;
 SELECT sum((x->>'amountPiasters')::bigint) INTO n FROM jsonb_array_elements(NEW.allocations) x;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.allocations) x WHERE (x->>'amountPiasters')::bigint<=0 OR (x->>'branchId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Branch" b WHERE b.id=(x->>'branchId')::uuid AND b."gymId"=NEW."gymId"))) THEN RAISE EXCEPTION 'Invalid collection attribution'; END IF;
 IF n IS DISTINCT FROM NEW."amountPiasters" THEN RAISE EXCEPTION 'Collection allocation mismatch'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION verify_service_collection_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "GymChargeCollection"; v "Visit"; m "MoneyTransaction"; receipt "VisitCancellation"; original_time TIMESTAMP(3);
BEGIN
 SELECT * INTO c FROM "GymChargeCollection" WHERE id=NEW."collectionId" FOR UPDATE;
 SELECT * INTO v FROM "Visit" WHERE id=NEW."visitId";
 SELECT * INTO m FROM "MoneyTransaction" WHERE id=NEW."moneyTransactionId";
 SELECT * INTO receipt FROM "VisitCancellation" WHERE "visitId"=v.id;
 SELECT "createdAt" INTO original_time FROM "MoneyTransaction" WHERE id=v."moneyTransactionId";
 IF v.status<>'CANCELLED' OR receipt.id IS NULL OR c."createdAt"<original_time OR
    NOT EXISTS(SELECT 1 FROM "Branch" WHERE id=v."branchId" AND "gymId"=c."gymId") OR
    NOT m.posted OR m.kind<>'ADJUSTMENT' OR m."reversalOfId" IS DISTINCT FROM c."moneyTransactionId" OR
    m."referenceId" IS DISTINCT FROM v.id OR m."actorId" IS DISTINCT FROM receipt."actorId" THEN
  RAISE EXCEPTION 'Service refund requires matching visit cancellation';
 END IF;
 IF (SELECT count(*) FROM "MoneyPosting" WHERE "transactionId"=m.id)<>2 OR EXISTS(
  SELECT 1 FROM (SELECT "accountId","deltaPiasters" amount FROM "MoneyPosting" WHERE "transactionId"=c."moneyTransactionId") a
  FULL JOIN (SELECT "accountId","deltaPiasters" amount FROM "MoneyPosting" WHERE "transactionId"=m.id) b USING("accountId")
  WHERE coalesce(a.amount,0)+coalesce(b.amount,0)<>0
 ) THEN RAISE EXCEPTION 'Service refund must exactly reverse collection'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER service_refund_valid AFTER INSERT ON "GymChargeCollectionReversal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_service_collection_refund();

ALTER TABLE "Booking" DROP CONSTRAINT booking_attendance;
ALTER TABLE "Booking" ADD CONSTRAINT booking_attendance CHECK (
 (status='ATTENDED' AND "visitId" IS NOT NULL) OR
 (status='CANCELLED') OR
 (status NOT IN ('ATTENDED','CANCELLED') AND "visitId" IS NULL)
);
CREATE OR REPLACE FUNCTION guard_booking_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable booking history'; END IF;
 IF OLD.status='ATTENDED' AND NEW.status='CANCELLED' AND
    (to_jsonb(NEW)-ARRAY['status','decisionReason','decidedById','decidedAt','traineePoints','gymPoints','platformPoints']) IS NOT DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','decisionReason','decidedById','decidedAt','traineePoints','gymPoints','platformPoints']) THEN
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['status','resolutionTransactionId','moneyTransactionId','visitId','qrHash','qrExpiresAt','qrSessionId','absenceReason','decisionReason','decidedById','decidedAt','traineePoints','gymPoints','platformPoints'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolutionTransactionId','moneyTransactionId','visitId','qrHash','qrExpiresAt','qrSessionId','absenceReason','decisionReason','decidedById','decidedAt','traineePoints','gymPoints','platformPoints'])
 THEN RAISE EXCEPTION 'Immutable booking terms'; END IF;
 IF OLD.status IN ('ATTENDED','CANCELLED','RESOLVED') THEN RAISE EXCEPTION 'Booking already resolved'; END IF;
 IF OLD.status='PENDING_REVIEW' AND NEW.status NOT IN ('PENDING_REVIEW','RESOLVED') THEN RAISE EXCEPTION 'Invalid booking transition'; END IF;
 RETURN NEW;
END $$;

-- Booking visit reversals first return the original settlement to escrow, then
-- release exactly those points to the original wallet in the same transaction.
CREATE FUNCTION verify_booking_visit_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "Booking"; v "Visit"; c "VisitCancellation"; p "PointTransaction";
BEGIN
 IF TG_TABLE_NAME='Booking' THEN SELECT * INTO b FROM "Booking" WHERE id=NEW.id;
 ELSE SELECT * INTO b FROM "Booking" WHERE "visitId"=NEW."visitId"; END IF;
 IF b.id IS NULL OR b."visitId" IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v FROM "Visit" WHERE id=b."visitId";
 IF v.status<>'CANCELLED' THEN
  IF b.status='CANCELLED' THEN RAISE EXCEPTION 'Booking cancellation requires visit cancellation'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO c FROM "VisitCancellation" WHERE "visitId"=v.id;
 SELECT * INTO p FROM "PointTransaction" WHERE "idempotencyKey"='visit-booking-refund:'||v.id;
 IF b.status<>'CANCELLED' OR b."traineePoints" IS DISTINCT FROM b.points OR b."gymPoints" IS DISTINCT FROM 0 OR b."platformPoints" IS DISTINCT FROM 0 OR
    c.id IS NULL OR p.id IS NULL OR NOT p.posted OR p.kind<>'BOOKING_SETTLE' OR p."referenceId" IS DISTINCT FROM c.id OR p."actorId" IS DISTINCT FROM c."actorId" OR
    (SELECT count(*) FROM "PointPosting" WHERE "transactionId"=p.id)<>2 OR
    NOT EXISTS(SELECT 1 FROM "PointPosting" WHERE "transactionId"=p.id AND "accountId"=b."holdAccountId" AND delta=-b.points) OR
    NOT EXISTS(SELECT 1 FROM "PointPosting" WHERE "transactionId"=p.id AND "accountId"=b."walletId" AND delta=b.points) THEN
  RAISE EXCEPTION 'Booking visit cancellation requires exact wallet refund';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER booking_visit_refund AFTER INSERT OR UPDATE ON "Booking" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_booking_visit_refund();
CREATE CONSTRAINT TRIGGER cancellation_booking_refund AFTER INSERT ON "VisitCancellation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_booking_visit_refund();

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN
  GRANT SELECT,INSERT ON "GymChargeCollectionReversal" TO gym_api_service;
 END IF;
END $$;
