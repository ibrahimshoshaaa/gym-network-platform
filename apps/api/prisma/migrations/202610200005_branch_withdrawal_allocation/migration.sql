ALTER TABLE "WithdrawalRequest" DROP CONSTRAINT withdrawal_gym_scope;
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT withdrawal_scope CHECK("transferProofKey" IS NULL);
ALTER TABLE "WithdrawalRequest" ADD COLUMN "allocationVersion" INTEGER NOT NULL DEFAULT 0 CHECK("allocationVersion" IN(0,1));
CREATE TABLE "WithdrawalAllocation" (
 id UUID PRIMARY KEY,"withdrawalId" UUID NOT NULL REFERENCES "WithdrawalRequest"(id),"branchId" UUID REFERENCES "Branch"(id),"amountPiasters" BIGINT NOT NULL CHECK("amountPiasters">0)
);
CREATE INDEX "WithdrawalAllocation_branchId_idx" ON "WithdrawalAllocation"("branchId");
CREATE INDEX "WithdrawalAllocation_withdrawalId_idx" ON "WithdrawalAllocation"("withdrawalId");
CREATE UNIQUE INDEX allocation_scope ON "WithdrawalAllocation"("withdrawalId",coalesce("branchId",'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TRIGGER allocation_immutable BEFORE UPDATE OR DELETE ON "WithdrawalAllocation" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE FUNCTION verify_withdrawal_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w "WithdrawalRequest";target UUID;
BEGIN
 target:=(CASE WHEN TG_TABLE_NAME='WithdrawalAllocation' THEN to_jsonb(NEW)->>'withdrawalId' ELSE to_jsonb(NEW)->>'id' END)::uuid;
 SELECT * INTO w FROM "WithdrawalRequest" WHERE id=target;
 IF w."allocationVersion"=1 AND ((SELECT coalesce(sum("amountPiasters"),0) FROM "WithdrawalAllocation" WHERE "withdrawalId"=target)<>w."amountPiasters" OR EXISTS(
 SELECT 1 FROM "WithdrawalAllocation" a LEFT JOIN "Branch" b ON b.id=a."branchId" WHERE a."withdrawalId"=target AND ((a."branchId" IS NOT NULL AND b."gymId"<>w."gymId") OR (w."branchId" IS NOT NULL AND a."branchId" IS DISTINCT FROM w."branchId")))) THEN RAISE EXCEPTION 'Invalid withdrawal attribution' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER withdrawal_allocation_check AFTER INSERT OR UPDATE ON "WithdrawalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_withdrawal_allocation();
CREATE CONSTRAINT TRIGGER allocation_check AFTER INSERT ON "WithdrawalAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_withdrawal_allocation();

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN GRANT SELECT,INSERT ON "WithdrawalAllocation" TO gym_api_service; END IF; END $$;
