-- Database-owned balances; migrations are authoritative (do not use db push).
ALTER TABLE "StaffAssignment" ADD CONSTRAINT staff_role CHECK (role IN ('CASHIER', 'BRANCH_MANAGER'));
ALTER TABLE "Branch" ADD CONSTRAINT branch_positive_terms CHECK ("visitPricePoints" > 0 AND "sessionMinutes" > 0);
ALTER TABLE "Branch" ADD CONSTRAINT branch_coordinates CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));
ALTER TABLE "TopupRequest" ADD CONSTRAINT topup_positive CHECK (points > 0 AND "chargePiasters" > 0);
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT withdrawal_positive CHECK ("amountPiasters" > 0);
ALTER TABLE "Visit" ADD CONSTRAINT visit_terms CHECK ("pointsCharged" > 0 AND "settlementPiasters" > 0 AND "expiresAt" > "startedAt");
CREATE UNIQUE INDEX visit_one_active ON "Visit" ("traineeId", "branchId") WHERE status = 'ACTIVE';
-- Expired ACTIVE rows must be transitioned inside the future entry transaction.
ALTER TABLE "PointAccount" ADD CONSTRAINT point_owner CHECK (
  (type = 'TRAINEE_WALLET' AND "ownerUserId" IS NOT NULL AND "branchId" IS NULL) OR
  (type = 'BRANCH_INVENTORY' AND "branchId" IS NOT NULL AND "ownerUserId" IS NULL AND "expiresAt" IS NULL) OR
  (type IN ('ISSUANCE','REDEEMED','EXPIRED') AND "ownerUserId" IS NULL AND "branchId" IS NULL AND "expiresAt" IS NULL));
ALTER TABLE "PointAccount" ADD CONSTRAINT point_nonnegative CHECK (type = 'ISSUANCE' OR balance >= 0);
CREATE UNIQUE INDEX point_system_singleton ON "PointAccount" (type) WHERE type IN ('ISSUANCE','REDEEMED','EXPIRED');
ALTER TABLE "MoneyAccount" ADD CONSTRAINT money_owner CHECK (
  (type = 'PLATFORM_OFFSET' AND "gymId" IS NULL AND "branchId" IS NULL) OR
  (type <> 'PLATFORM_OFFSET' AND "gymId" IS NOT NULL));
ALTER TABLE "MoneyAccount" ADD CONSTRAINT money_nonnegative CHECK (type = 'PLATFORM_OFFSET' OR "balancePiasters" >= 0);
CREATE UNIQUE INDEX money_system_singleton ON "MoneyAccount" (type) WHERE "gymId" IS NULL;
CREATE UNIQUE INDEX money_gym_scope ON "MoneyAccount" (type, "gymId") WHERE "gymId" IS NOT NULL AND "branchId" IS NULL;
CREATE UNIQUE INDEX money_branch_scope ON "MoneyAccount" (type, "branchId") WHERE "branchId" IS NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT audit_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;
CREATE FUNCTION deny_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable ledger record' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();

ALTER TABLE "PointTransaction" ADD CONSTRAINT point_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "PointTransaction" ADD CONSTRAINT point_command_fields CHECK ("actorId" IS NOT NULL AND length("idempotencyKey") BETWEEN 1 AND 128 AND "requestHash" ~ '^[0-9a-f]{64}$' AND reason IS NOT NULL AND length(trim(reason)) > 0 AND "reversalOfId" IS DISTINCT FROM id);
ALTER TABLE "PointPosting" ADD CONSTRAINT point_nonzero CHECK ("delta" <> 0);
CREATE FUNCTION point_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."balance" <> 0 THEN RAISE EXCEPTION 'Accounts must start at zero' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."id" IS DISTINCT FROM OLD."id" OR NEW."type" IS DISTINCT FROM OLD."type" OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId") THEN RAISE EXCEPTION 'Immutable account identity' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER point_account_guard BEFORE INSERT OR UPDATE ON "PointAccount" FOR EACH ROW EXECUTE FUNCTION point_account_guard();
CREATE FUNCTION point_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sealed boolean;
BEGIN
  SELECT posted INTO sealed FROM "PointTransaction" WHERE id = NEW."transactionId" FOR UPDATE;
  IF sealed IS DISTINCT FROM false THEN RAISE EXCEPTION 'Transaction is missing or sealed' USING ERRCODE = '23514'; END IF;
  UPDATE "PointAccount" SET "balance" = "balance" + NEW."delta" WHERE id = NEW."accountId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Account missing' USING ERRCODE = '23503'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER point_apply_posting BEFORE INSERT ON "PointPosting" FOR EACH ROW EXECUTE FUNCTION point_apply_posting();
CREATE TRIGGER point_posting_immutable BEFORE UPDATE OR DELETE ON "PointPosting" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE FUNCTION point_transaction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.posted THEN RAISE EXCEPTION 'Immutable ledger transaction' USING ERRCODE = '23514'; END IF;
  IF NEW.posted AND ((SELECT count(*) FROM "PointPosting" WHERE "transactionId" = NEW.id) < 2 OR
    (SELECT COALESCE(sum("delta"),0) FROM "PointPosting" WHERE "transactionId" = NEW.id) <> 0) THEN
    RAISE EXCEPTION 'Unbalanced transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER point_transaction_guard BEFORE UPDATE OR DELETE ON "PointTransaction" FOR EACH ROW EXECUTE FUNCTION point_transaction_guard();
CREATE FUNCTION point_check_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "PointTransaction" WHERE id = NEW.id AND posted) THEN
    RAISE EXCEPTION 'Unsealed ledger transaction' USING ERRCODE = '23514';
  END IF;
  -- Also validate INSERT posted=true, which has no UPDATE sealing event.
  IF (SELECT count(*) FROM "PointPosting" WHERE "transactionId" = NEW.id) < 2 OR
     (SELECT COALESCE(sum("delta"),0) FROM "PointPosting" WHERE "transactionId" = NEW.id) <> 0 THEN
    RAISE EXCEPTION 'Unbalanced transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER point_sealed_at_commit AFTER INSERT OR UPDATE ON "PointTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION point_check_sealed();
CREATE FUNCTION point_check_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual numeric; expected numeric;
BEGIN
  SELECT "balance" INTO actual FROM "PointAccount" WHERE id = NEW.id;
  SELECT COALESCE(sum("delta"),0) INTO expected FROM "PointPosting" WHERE "accountId" = NEW.id;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Account balance does not match postings' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER point_balance_at_commit AFTER INSERT OR UPDATE ON "PointAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION point_check_balance();

ALTER TABLE "MoneyTransaction" ADD CONSTRAINT money_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT money_command_fields CHECK ("actorId" IS NOT NULL AND length("idempotencyKey") BETWEEN 1 AND 128 AND "requestHash" ~ '^[0-9a-f]{64}$' AND reason IS NOT NULL AND length(trim(reason)) > 0 AND "reversalOfId" IS DISTINCT FROM id);
ALTER TABLE "MoneyPosting" ADD CONSTRAINT money_nonzero CHECK ("deltaPiasters" <> 0);
CREATE FUNCTION money_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."balancePiasters" <> 0 THEN RAISE EXCEPTION 'Accounts must start at zero' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."id" IS DISTINCT FROM OLD."id" OR NEW."type" IS DISTINCT FROM OLD."type" OR NEW."gymId" IS DISTINCT FROM OLD."gymId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId") THEN RAISE EXCEPTION 'Immutable account identity' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_account_guard BEFORE INSERT OR UPDATE ON "MoneyAccount" FOR EACH ROW EXECUTE FUNCTION money_account_guard();
CREATE FUNCTION money_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sealed boolean;
BEGIN
  SELECT posted INTO sealed FROM "MoneyTransaction" WHERE id = NEW."transactionId" FOR UPDATE;
  IF sealed IS DISTINCT FROM false THEN RAISE EXCEPTION 'Transaction is missing or sealed' USING ERRCODE = '23514'; END IF;
  UPDATE "MoneyAccount" SET "balancePiasters" = "balancePiasters" + NEW."deltaPiasters" WHERE id = NEW."accountId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Account missing' USING ERRCODE = '23503'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_apply_posting BEFORE INSERT ON "MoneyPosting" FOR EACH ROW EXECUTE FUNCTION money_apply_posting();
CREATE TRIGGER money_posting_immutable BEFORE UPDATE OR DELETE ON "MoneyPosting" FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE FUNCTION money_transaction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.posted THEN RAISE EXCEPTION 'Immutable ledger transaction' USING ERRCODE = '23514'; END IF;
  IF NEW.posted AND ((SELECT count(*) FROM "MoneyPosting" WHERE "transactionId" = NEW.id) < 2 OR
    (SELECT COALESCE(sum("deltaPiasters"),0) FROM "MoneyPosting" WHERE "transactionId" = NEW.id) <> 0) THEN
    RAISE EXCEPTION 'Unbalanced transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_transaction_guard BEFORE UPDATE OR DELETE ON "MoneyTransaction" FOR EACH ROW EXECUTE FUNCTION money_transaction_guard();
CREATE FUNCTION money_check_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MoneyTransaction" WHERE id = NEW.id AND posted) THEN
    RAISE EXCEPTION 'Unsealed ledger transaction' USING ERRCODE = '23514';
  END IF;
  -- Also validate INSERT posted=true, which has no UPDATE sealing event.
  IF (SELECT count(*) FROM "MoneyPosting" WHERE "transactionId" = NEW.id) < 2 OR
     (SELECT COALESCE(sum("deltaPiasters"),0) FROM "MoneyPosting" WHERE "transactionId" = NEW.id) <> 0 THEN
    RAISE EXCEPTION 'Unbalanced transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER money_sealed_at_commit AFTER INSERT OR UPDATE ON "MoneyTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_check_sealed();
CREATE FUNCTION money_check_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual numeric; expected numeric;
BEGIN
  SELECT "balancePiasters" INTO actual FROM "MoneyAccount" WHERE id = NEW.id;
  SELECT COALESCE(sum("deltaPiasters"),0) INTO expected FROM "MoneyPosting" WHERE "accountId" = NEW.id;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Account balance does not match postings' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER money_balance_at_commit AFTER INSERT OR UPDATE ON "MoneyAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_check_balance();
