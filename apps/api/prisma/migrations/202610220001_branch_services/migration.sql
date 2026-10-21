CREATE TABLE "BranchService" (
  "id" UUID PRIMARY KEY,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "points" INTEGER,
  "durationMinutes" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "approvedAt" TIMESTAMP(3),
  "approvedById" UUID REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("points" IS NULL OR "points" BETWEEN 1 AND 1000000),
  CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1440),
  CHECK (("approvedAt" IS NULL AND "approvedById" IS NULL AND "points" IS NULL AND "durationMinutes" IS NULL AND NOT "active") OR
         ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "points" IS NOT NULL AND "durationMinutes" IS NOT NULL))
);
CREATE INDEX "BranchService_branchId_active_id_idx" ON "BranchService"("branchId", "active", "id");
CREATE TABLE "ServicePriceRequest" (
  "id" UUID PRIMARY KEY,
  "serviceId" UUID NOT NULL REFERENCES "BranchService"("id") ON DELETE RESTRICT,
  "baseVersion" INTEGER NOT NULL CHECK ("baseVersion" >= 0),
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "points" INTEGER NOT NULL CHECK ("points" BETWEEN 1 AND 1000000),
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" BETWEEN 1 AND 1440),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  "requestedById" UUID NOT NULL REFERENCES "User"("id"),
  "reason" TEXT NOT NULL,
  "reviewedById" UUID REFERENCES "User"("id"),
  "reviewReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("status" = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL) OR
         ("status" <> 'PENDING' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL))
);
CREATE INDEX "ServicePriceRequest_status_id_idx" ON "ServicePriceRequest"("status", "id");
CREATE INDEX "ServicePriceRequest_serviceId_status_idx" ON "ServicePriceRequest"("serviceId", "status");
CREATE UNIQUE INDEX "ServicePriceRequest_one_pending" ON "ServicePriceRequest"("serviceId") WHERE "status" = 'PENDING';
