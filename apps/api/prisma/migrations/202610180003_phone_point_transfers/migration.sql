-- CreateTable
CREATE TABLE "PointDispatch" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "phoneLast4" TEXT NOT NULL,
    "gymId" UUID,
    "branchId" UUID,
    "points" INTEGER NOT NULL,
    "chargePiasters" BIGINT NOT NULL,
    "unitPricePiasters" BIGINT NOT NULL,
    "discountBps" INTEGER NOT NULL,
    "pricingVersion" INTEGER NOT NULL,
    "policyId" UUID NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentReference" TEXT,
    "pointTransactionId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointDispatch_paymentReference_key" ON "PointDispatch"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "PointDispatch_pointTransactionId_key" ON "PointDispatch"("pointTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PointDispatch_idempotencyKey_key" ON "PointDispatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PointDispatch_gymId_createdAt_id_idx" ON "PointDispatch"("gymId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PointDispatch_recipientId_createdAt_id_idx" ON "PointDispatch"("recipientId", "createdAt", "id");

ALTER TABLE "PointDispatch" ADD FOREIGN KEY ("actorId") REFERENCES "User"(id), ADD FOREIGN KEY ("recipientId") REFERENCES "User"(id), ADD FOREIGN KEY ("gymId") REFERENCES "Gym"(id), ADD FOREIGN KEY ("branchId") REFERENCES "Branch"(id), ADD FOREIGN KEY ("policyId") REFERENCES "PricingPolicy"(id), ADD FOREIGN KEY ("pointTransactionId") REFERENCES "PointTransaction"(id);
ALTER TABLE "PointDispatch" ADD CONSTRAINT dispatch_values CHECK (kind IN ('ADMIN_TOPUP','GYM_SALE') AND points>0 AND "chargePiasters">0 AND "unitPricePiasters">0 AND "discountBps" BETWEEN 0 AND 9999 AND "pricingVersion">0 AND "chargePiasters"=ceil(points::numeric*"unitPricePiasters"*(10000-"discountBps")/10000) AND length("phoneLast4")=4 AND length("requestHash")=64 AND "paymentMethod" IN ('CASH','INSTAPAY','WALLET') AND (kind<>'GYM_SALE' OR ("gymId" IS NOT NULL AND "branchId" IS NULL AND "discountBps"=0 AND "paymentMethod"='CASH')) AND (kind<>'ADMIN_TOPUP' OR "paymentReference" IS NOT NULL));
ALTER TABLE "PointDispatch" ADD CONSTRAINT dispatch_target CHECK (kind<>'ADMIN_TOPUP' OR (("gymId" IS NULL AND "branchId" IS NULL) OR ("gymId" IS NOT NULL AND "branchId" IS NOT NULL)));
CREATE TRIGGER "PointDispatch_immutable" BEFORE UPDATE OR DELETE ON "PointDispatch" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE FUNCTION check_point_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE legs integer; good integer; BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PointTransaction" t WHERE t.id=NEW."pointTransactionId" AND t.posted AND t."referenceId"=NEW.id AND t."actorId"=NEW."actorId" AND t.kind::text=CASE WHEN NEW.kind='ADMIN_TOPUP' THEN 'ISSUE' ELSE 'TRANSFER' END) THEN RAISE EXCEPTION 'Missing dispatch ledger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "PricingPolicy" p WHERE p.id=NEW."policyId" AND p.version=NEW."pricingVersion" AND p."pointPricePiasters"=NEW."unitPricePiasters" AND NEW."discountBps"=CASE WHEN NEW.kind='ADMIN_TOPUP' AND NEW."branchId" IS NOT NULL THEN p."gymDiscountBps" ELSE 0 END) THEN RAISE EXCEPTION 'Invalid dispatch policy'; END IF;
 SELECT count(*) INTO legs FROM "PointPosting" WHERE "transactionId"=NEW."pointTransactionId";
 SELECT count(*) INTO good FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND p.delta=NEW.points AND ((NEW."branchId" IS NULL AND a.type='TRAINEE_WALLET' AND a."ownerUserId"=NEW."recipientId") OR (NEW.kind='ADMIN_TOPUP' AND a.type='BRANCH_INVENTORY' AND a."branchId"=NEW."branchId"));
 IF good<>1 THEN RAISE EXCEPTION 'Wrong dispatch recipient'; END IF;
 IF NEW.kind='ADMIN_TOPUP' THEN
  IF legs<>2 OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."actorId" AND role='PLATFORM_ADMIN') OR NOT EXISTS(SELECT 1 FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" WHERE p."transactionId"=NEW."pointTransactionId" AND a.type='ISSUANCE' AND p.delta=-NEW.points) THEN RAISE EXCEPTION 'Wrong topup source'; END IF;
  IF NEW."branchId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Branch" b JOIN "Gym" g ON g.id=b."gymId" WHERE b.id=NEW."branchId" AND g.id=NEW."gymId" AND g."ownerId"=NEW."recipientId") THEN RAISE EXCEPTION 'Wrong funding gym'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "Gym" WHERE id=NEW."gymId" AND "ownerId"=NEW."actorId") THEN RAISE EXCEPTION 'Wrong selling gym'; END IF;
  SELECT count(*) INTO good FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" JOIN "Branch" b ON b.id=a."branchId" WHERE p."transactionId"=NEW."pointTransactionId" AND p.delta<0 AND a.type='BRANCH_INVENTORY' AND b."gymId"=NEW."gymId";
  IF good<>legs-1 OR good<1 THEN RAISE EXCEPTION 'Wrong sale sources'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "PointDispatch_ledger_guard" AFTER INSERT ON "PointDispatch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_point_dispatch();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN GRANT SELECT,INSERT ON "PointDispatch" TO gym_api_service; END IF; END $$;

CREATE INDEX "PointDispatch_kind_createdAt_id_idx" ON "PointDispatch"(kind,"createdAt",id);
