-- Keep legacy immutable branch topups valid, while new central topups and
-- owner sales must match the exact scoped ledger accounts.
ALTER TABLE "PointDispatch" DROP CONSTRAINT dispatch_target;
ALTER TABLE "PointDispatch" ADD CONSTRAINT dispatch_target CHECK (
 kind<>'ADMIN_TOPUP' OR ("gymId" IS NOT NULL OR "branchId" IS NULL));
CREATE OR REPLACE FUNCTION check_point_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE legs integer; good integer; BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PointTransaction" t WHERE t.id=NEW."pointTransactionId" AND t.posted AND t."referenceId"=NEW.id AND t."actorId"=NEW."actorId" AND t.kind::text=CASE WHEN NEW.kind='ADMIN_TOPUP' THEN 'ISSUE' ELSE 'TRANSFER' END) THEN RAISE EXCEPTION 'Missing dispatch ledger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "PricingPolicy" p WHERE p.id=NEW."policyId" AND p.version=NEW."pricingVersion" AND p."pointPricePiasters"=NEW."unitPricePiasters" AND NEW."discountBps"=CASE WHEN NEW.kind='ADMIN_TOPUP' AND NEW."gymId" IS NOT NULL THEN p."gymDiscountBps" ELSE 0 END) THEN RAISE EXCEPTION 'Invalid dispatch policy'; END IF;
 SELECT count(*) INTO legs FROM "PointPosting" WHERE "transactionId"=NEW."pointTransactionId";
 SELECT count(*) INTO good FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND p.delta=NEW.points AND (((NEW.kind='GYM_SALE' OR NEW."gymId" IS NULL) AND a.type='TRAINEE_WALLET' AND a."ownerUserId"=NEW."recipientId") OR
 (NEW.kind='ADMIN_TOPUP' AND NEW."branchId" IS NOT NULL AND a.type='BRANCH_INVENTORY' AND a."branchId"=NEW."branchId") OR
 (NEW.kind='ADMIN_TOPUP' AND NEW."gymId" IS NOT NULL AND NEW."branchId" IS NULL AND a.type='GYM_INVENTORY' AND a."gymId"=NEW."gymId"));
 IF good<>1 THEN RAISE EXCEPTION 'Wrong dispatch recipient'; END IF;
 IF NEW.kind='ADMIN_TOPUP' THEN
  IF legs<>2 OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."actorId" AND role='PLATFORM_ADMIN') OR NOT EXISTS(SELECT 1 FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND a.type='ISSUANCE' AND p.delta=-NEW.points) THEN RAISE EXCEPTION 'Wrong topup source'; END IF;
  IF NEW."gymId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Gym" WHERE id=NEW."gymId" AND "ownerId"=NEW."recipientId") THEN RAISE EXCEPTION 'Wrong funding owner'; END IF;
  IF NEW."branchId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Branch" b JOIN "Gym" g ON g.id=b."gymId" WHERE b.id=NEW."branchId" AND g.id=NEW."gymId" AND g."ownerId"=NEW."recipientId") THEN RAISE EXCEPTION 'Wrong funding gym'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "Gym" WHERE id=NEW."gymId" AND "ownerId"=NEW."actorId") THEN RAISE EXCEPTION 'Wrong selling gym'; END IF;
  SELECT count(*) INTO good FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND p.delta=-NEW.points AND a.type='GYM_INVENTORY' AND a."gymId"=NEW."gymId";
  IF legs<>2 OR good<>1 THEN RAISE EXCEPTION 'Wrong sale sources'; END IF;
 END IF;
 RETURN NULL;
END $$;

