-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "equipment" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "clientKey" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "estimatedPiasters" BIGINT,
    "approvedPiasters" BIGINT,
    "finalPiasters" BIGINT,
    "technicianName" TEXT,
    "technicianPhone" TEXT,
    "appointmentAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "resumeStatus" TEXT,
    "workSummary" TEXT,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceImage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "requestId" UUID,
    "objectKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceRequest_branchId_createdAt_id_idx" ON "MaintenanceRequest"("branchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_status_createdAt_id_idx" ON "MaintenanceRequest"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRequest_createdById_clientKey_key" ON "MaintenanceRequest"("createdById", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceImage_objectKey_key" ON "MaintenanceImage"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceImage_assetId_key" ON "MaintenanceImage"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceImage_requestId_createdAt_idx" ON "MaintenanceImage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_requestId_createdAt_id_idx" ON "MaintenanceEvent"("requestId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceImage" ADD CONSTRAINT "MaintenanceImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceImage" ADD CONSTRAINT "MaintenanceImage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceImage" ADD CONSTRAINT "MaintenanceImage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest"
 ADD CONSTRAINT "MaintenanceRequest_status_check" CHECK (status IN ('NEW','REVIEWING','AWAITING_APPROVAL','SCHEDULED','IN_PROGRESS','AWAITING_CONFIRMATION','COMPLETED','CANCELLED')),
 ADD CONSTRAINT "MaintenanceRequest_version_check" CHECK (version>0),
 ADD CONSTRAINT "MaintenanceRequest_prices_check" CHECK (("estimatedPiasters" IS NULL OR "estimatedPiasters" BETWEEN 0 AND 999999999999) AND ("approvedPiasters" IS NULL OR "approvedPiasters" BETWEEN 0 AND 999999999999) AND ("finalPiasters" IS NULL OR "finalPiasters" BETWEEN 0 AND 999999999999)),
 ADD CONSTRAINT "MaintenanceRequest_quote_check" CHECK (status NOT IN ('AWAITING_APPROVAL','SCHEDULED','IN_PROGRESS','AWAITING_CONFIRMATION','COMPLETED') OR ("estimatedPiasters" IS NOT NULL AND "technicianName" IS NOT NULL AND "technicianPhone" IS NOT NULL AND "appointmentAt" IS NOT NULL)),
 ADD CONSTRAINT "MaintenanceRequest_approval_check" CHECK (status NOT IN ('SCHEDULED','IN_PROGRESS','AWAITING_CONFIRMATION','COMPLETED') OR ("approvedPiasters" IS NOT NULL AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)),
 ADD CONSTRAINT "MaintenanceRequest_final_check" CHECK (status NOT IN ('AWAITING_CONFIRMATION','COMPLETED') OR ("finalPiasters" IS NOT NULL AND "finalPiasters"<="approvedPiasters" AND "workSummary" IS NOT NULL)),
 ADD CONSTRAINT "MaintenanceRequest_confirmation_check" CHECK (status<>'COMPLETED' OR ("confirmedById" IS NOT NULL AND "confirmedAt" IS NOT NULL)),
 ADD CONSTRAINT "MaintenanceRequest_resume_check" CHECK ("resumeStatus" IS NULL OR "resumeStatus" IN ('IN_PROGRESS','SCHEDULED'));
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "MaintenanceRequest", "MaintenanceImage", "MaintenanceEvent" TO %I',r);
  END IF;
 END LOOP;
END $$;
