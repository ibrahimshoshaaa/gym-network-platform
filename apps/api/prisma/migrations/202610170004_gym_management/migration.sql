-- CreateEnum
CREATE TYPE "GymStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvitationType" AS ENUM ('OWNER', 'STAFF');

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ownerAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "status" "GymStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "governorate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "priceApprovedAt" TIMESTAMP(3),
ADD COLUMN     "priceApprovedById" UUID,
ADD COLUMN     "pricingVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StaffInvitation" (
    "id" UUID NOT NULL,
    "type" "InvitationType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID,
    "role" "UserRole" NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPricingRequest" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "visitPricePoints" INTEGER NOT NULL,
    "sessionMinutes" INTEGER NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "previousPricePoints" INTEGER NOT NULL,
    "previousSessionMinutes" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "reviewedById" UUID,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchPricingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvitation_gymId_createdAt_idx" ON "StaffInvitation"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffInvitation_userId_idx" ON "StaffInvitation"("userId");

-- CreateIndex
CREATE INDEX "BranchPricingRequest_branchId_createdAt_idx" ON "BranchPricingRequest"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_branchId_gymId_fkey" FOREIGN KEY ("branchId", "gymId") REFERENCES "Branch"("id", "gymId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPricingRequest" ADD CONSTRAINT "BranchPricingRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Operational approval history and invitation integrity.
ALTER TABLE "Branch" ADD CONSTRAINT branch_pricing_version CHECK ("pricingVersion" >= 0);
ALTER TABLE "Branch" ADD CONSTRAINT branch_pricing_reviewer_fk FOREIGN KEY ("priceApprovedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "StaffInvitation" ADD CONSTRAINT invitation_creator_fk FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "StaffInvitation" ADD CONSTRAINT invitation_shape CHECK (
  (type = 'OWNER' AND role = 'GYM_OWNER' AND "branchId" IS NULL) OR
  (type = 'STAFF' AND role IN ('CASHIER','BRANCH_MANAGER') AND "branchId" IS NOT NULL));
ALTER TABLE "StaffInvitation" ADD CONSTRAINT invitation_lifecycle CHECK (
  "tokenHash" ~ '^[0-9a-f]{64}$' AND "expiresAt" > "createdAt" AND NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL));
CREATE UNIQUE INDEX invitation_one_pending ON "StaffInvitation" ("userId", "gymId", COALESCE("branchId", '00000000-0000-0000-0000-000000000000'::uuid), role) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
ALTER TABLE "BranchPricingRequest" ADD CONSTRAINT pricing_requestor_fk FOREIGN KEY ("requestedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "BranchPricingRequest" ADD CONSTRAINT pricing_reviewer_fk FOREIGN KEY ("reviewedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "BranchPricingRequest" ADD CONSTRAINT pricing_positive CHECK ("visitPricePoints" > 0 AND "sessionMinutes" > 0 AND "previousPricePoints" > 0 AND "previousSessionMinutes" > 0 AND "baseVersion" >= 0);
ALTER TABLE "BranchPricingRequest" ADD CONSTRAINT pricing_review_state CHECK (
  (status = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL) OR
  (status IN ('APPROVED','REJECTED') AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason")) > 0));
CREATE UNIQUE INDEX pricing_one_pending ON "BranchPricingRequest" ("branchId") WHERE status = 'PENDING';

CREATE FUNCTION guard_pricing_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'PENDING' THEN RAISE EXCEPTION 'Immutable pricing history' USING ERRCODE = '23514'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."branchId" IS DISTINCT FROM OLD."branchId" OR NEW."requestedById" IS DISTINCT FROM OLD."requestedById" OR NEW."visitPricePoints" IS DISTINCT FROM OLD."visitPricePoints" OR NEW."sessionMinutes" IS DISTINCT FROM OLD."sessionMinutes" OR NEW."baseVersion" IS DISTINCT FROM OLD."baseVersion" OR NEW."previousPricePoints" IS DISTINCT FROM OLD."previousPricePoints" OR NEW."previousSessionMinutes" IS DISTINCT FROM OLD."previousSessionMinutes" OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Immutable pricing proposal' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pricing_history_guard BEFORE UPDATE OR DELETE ON "BranchPricingRequest" FOR EACH ROW EXECUTE FUNCTION guard_pricing_history();
CREATE FUNCTION guard_invitation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."acceptedAt" IS NOT NULL OR OLD."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Immutable consumed invitation' USING ERRCODE = '23514'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.type IS DISTINCT FROM OLD.type OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."gymId" IS DISTINCT FROM OLD."gymId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId" OR NEW.role IS DISTINCT FROM OLD.role OR NEW."createdById" IS DISTINCT FROM OLD."createdById" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Immutable invitation identity' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invitation_history_guard BEFORE UPDATE OR DELETE ON "StaffInvitation" FOR EACH ROW EXECUTE FUNCTION guard_invitation_history();

