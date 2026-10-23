ALTER TABLE "PromotionRequest" ADD COLUMN "serviceId" UUID REFERENCES "BranchService"(id), ADD COLUMN "serviceName" TEXT;
CREATE TABLE "GymServiceCharge" (
 id UUID PRIMARY KEY, "gymId" UUID NOT NULL REFERENCES "Gym"(id), "branchId" UUID NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('MAINTENANCE','PROMOTION')), "sourceId" UUID NOT NULL,
 "amountPiasters" BIGINT NOT NULL CHECK ("amountPiasters">=0), description TEXT NOT NULL,
 "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "voidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("branchId","gymId") REFERENCES "Branch"(id,"gymId"), UNIQUE(kind,"sourceId")
);
CREATE INDEX "GymServiceCharge_gymId_dueAt_id_idx" ON "GymServiceCharge"("gymId","dueAt",id);
CREATE TABLE "GymChargeCollection" (
 id UUID PRIMARY KEY, "gymId" UUID NOT NULL REFERENCES "Gym"(id), "chargeId" UUID NOT NULL REFERENCES "GymServiceCharge"(id),
 "amountPiasters" BIGINT NOT NULL CHECK ("amountPiasters">0), "moneyTransactionId" UUID NOT NULL UNIQUE REFERENCES "MoneyTransaction"(id),
 allocations JSONB NOT NULL CHECK (jsonb_typeof(allocations)='array'), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GymChargeCollection_gymId_createdAt_idx" ON "GymChargeCollection"("gymId","createdAt");
CREATE FUNCTION guard_service_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Service charges are retained'; END IF;
 IF (to_jsonb(NEW)-'voidedAt') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt') OR OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL OR OLD."dueAt"<=clock_timestamp() OR EXISTS(SELECT 1 FROM "GymChargeCollection" WHERE "chargeId"=OLD.id) THEN RAISE EXCEPTION 'Service charge is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_charge_immutable BEFORE UPDATE OR DELETE ON "GymServiceCharge" FOR EACH ROW EXECUTE FUNCTION guard_service_charge();
CREATE FUNCTION verify_service_collection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "GymServiceCharge"; n BIGINT; legs INT;
BEGIN
 SELECT * INTO c FROM "GymServiceCharge" WHERE id=NEW."chargeId" FOR UPDATE;
 IF c."gymId"<>NEW."gymId" OR c."voidedAt" IS NOT NULL OR c."dueAt">clock_timestamp() THEN RAISE EXCEPTION 'Invalid charge collection'; END IF;
 SELECT sum("amountPiasters") INTO n FROM "GymChargeCollection" WHERE "chargeId"=c.id;
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
CREATE CONSTRAINT TRIGGER service_collection_valid AFTER INSERT ON "GymChargeCollection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_service_collection();
CREATE FUNCTION immutable_service_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Charge collections are immutable'; END $$;
CREATE TRIGGER service_collection_immutable BEFORE UPDATE OR DELETE ON "GymChargeCollection" FOR EACH ROW EXECUTE FUNCTION immutable_service_collection();

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN
 GRANT SELECT,INSERT,UPDATE ON "GymServiceCharge" TO gym_api_service;
 GRANT SELECT,INSERT ON "GymChargeCollection" TO gym_api_service;
 END IF;
END $$;
