ALTER TABLE "PointAccount" DROP CONSTRAINT point_owner;
ALTER TABLE "PointAccount" ADD CONSTRAINT point_owner CHECK (
 (type='GYM_INVENTORY' AND "gymId" IS NOT NULL AND "branchId" IS NULL AND "ownerUserId" IS NULL AND "expiresAt" IS NULL) OR
 (type IN ('TRAINEE_WALLET','BOOKING_HOLD') AND "ownerUserId" IS NOT NULL AND "branchId" IS NULL AND "gymId" IS NULL AND (type<>'BOOKING_HOLD' OR "expiresAt" IS NULL)) OR
 (type='BRANCH_INVENTORY' AND "branchId" IS NOT NULL AND "ownerUserId" IS NULL AND "gymId" IS NULL AND "expiresAt" IS NULL) OR
 (type IN ('ISSUANCE','REDEEMED','EXPIRED') AND "ownerUserId" IS NULL AND "branchId" IS NULL AND "gymId" IS NULL AND "expiresAt" IS NULL));
CREATE TABLE "Booking" (
 "id" UUID PRIMARY KEY, "traineeId" UUID NOT NULL REFERENCES "User"(id),
 "branchId" UUID NOT NULL REFERENCES "Branch"(id), "policyId" UUID NOT NULL REFERENCES "BookingPolicy"(id),
 "policySnapshot" JSONB NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL, "deadlineAt" TIMESTAMP(3) NOT NULL,
 "points" INTEGER NOT NULL CHECK ("points">0), "sessionMinutes" INTEGER NOT NULL CHECK ("sessionMinutes">0),
 "pricingPolicyId" UUID NOT NULL REFERENCES "PricingPolicy"(id),
 "unitPricePiasters" BIGINT NOT NULL CHECK ("unitPricePiasters">0),
 "redemptionBps" INTEGER NOT NULL CHECK ("redemptionBps" BETWEEN 1 AND 10000),
 "branchPricingVersion" INTEGER NOT NULL,
 "walletId" UUID NOT NULL REFERENCES "PointAccount"(id), "holdAccountId" UUID NOT NULL REFERENCES "PointAccount"(id),
 "status" TEXT NOT NULL DEFAULT 'RESERVED' CHECK ("status" IN ('RESERVED','PENDING_REVIEW','ATTENDED','CANCELLED','RESOLVED')),
 "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "reserveTransactionId" UUID NOT NULL REFERENCES "PointTransaction"(id),
 "resolutionTransactionId" UUID REFERENCES "PointTransaction"(id), "moneyTransactionId" UUID REFERENCES "MoneyTransaction"(id),
 "visitId" UUID REFERENCES "Visit"(id), "qrHash" TEXT, "qrExpiresAt" TIMESTAMP(3), "qrSessionId" UUID REFERENCES "AuthSession"(id),
 "absenceReason" TEXT, "decisionReason" TEXT, "decidedById" UUID REFERENCES "User"(id), "decidedAt" TIMESTAMP(3),
 "traineePoints" INTEGER, "gymPoints" INTEGER, "platformPoints" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT booking_deadline CHECK ("deadlineAt">="scheduledAt"),
 CONSTRAINT booking_resolution CHECK (
 (status IN ('RESERVED','PENDING_REVIEW') AND "resolutionTransactionId" IS NULL AND "decidedAt" IS NULL AND "traineePoints" IS NULL AND "gymPoints" IS NULL AND "platformPoints" IS NULL) OR
 (status IN ('ATTENDED','CANCELLED','RESOLVED') AND "resolutionTransactionId" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "decisionReason" IS NOT NULL AND "traineePoints">=0 AND "gymPoints">=0 AND "platformPoints">=0 AND "traineePoints"::bigint+"gymPoints"+"platformPoints"="points")),
 CONSTRAINT booking_attendance CHECK ((status='ATTENDED')=("visitId" IS NOT NULL))
);
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
CREATE UNIQUE INDEX "Booking_reserveTransactionId_key" ON "Booking"("reserveTransactionId");
CREATE UNIQUE INDEX "Booking_resolutionTransactionId_key" ON "Booking"("resolutionTransactionId");
CREATE UNIQUE INDEX "Booking_moneyTransactionId_key" ON "Booking"("moneyTransactionId");
CREATE UNIQUE INDEX "Booking_visitId_key" ON "Booking"("visitId");
CREATE UNIQUE INDEX "Booking_qrHash_key" ON "Booking"("qrHash");
CREATE INDEX "Booking_traineeId_createdAt_idx" ON "Booking"("traineeId","createdAt");
CREATE INDEX "Booking_status_deadlineAt_idx" ON "Booking"("status","deadlineAt");
CREATE FUNCTION guard_booking_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable booking history'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','resolutionTransactionId','moneyTransactionId','visitId','qrHash','qrExpiresAt','qrSessionId','absenceReason','decisionReason','decidedById','decidedAt','traineePoints','gymPoints','platformPoints'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolutionTransactionId','moneyTransactionId','visitId','qrHash','qrExpiresAt','qrSessionId','absenceReason','decisionReason','decidedById','decidedAt','traineePoints','gymPoints','platformPoints'])
 THEN RAISE EXCEPTION 'Immutable booking terms'; END IF;
 IF OLD.status IN ('ATTENDED','CANCELLED','RESOLVED') THEN RAISE EXCEPTION 'Booking already resolved'; END IF;
 IF OLD.status='PENDING_REVIEW' AND NEW.status NOT IN ('PENDING_REVIEW','RESOLVED') THEN RAISE EXCEPTION 'Invalid booking transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_history BEFORE UPDATE OR DELETE ON "Booking" FOR EACH ROW EXECUTE FUNCTION guard_booking_history();
