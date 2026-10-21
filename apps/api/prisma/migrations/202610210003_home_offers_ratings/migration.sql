-- CreateTable
CREATE TABLE "PromotionRequest" (
    "id" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "feePiasters" BIGINT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "radiusKm" INTEGER NOT NULL DEFAULT 20,
    "reviewReason" TEXT,
    "reviewedById" UUID,
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "clientKey" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionImage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitRating" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "traineeId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRequest_imageId_key" ON "PromotionRequest"("imageId");

-- CreateIndex
CREATE INDEX "PromotionRequest_status_startsAt_endsAt_idx" ON "PromotionRequest"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PromotionRequest_branchId_createdAt_id_idx" ON "PromotionRequest"("branchId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRequest_requestedById_clientKey_key" ON "PromotionRequest"("requestedById", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionImage_objectKey_key" ON "PromotionImage"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionImage_assetId_key" ON "PromotionImage"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitRating_visitId_key" ON "VisitRating"("visitId");

-- CreateIndex
CREATE INDEX "VisitRating_branchId_idx" ON "VisitRating"("branchId");

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "PromotionImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionImage" ADD CONSTRAINT "PromotionImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionImage" ADD CONSTRAINT "PromotionImage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRating" ADD CONSTRAINT "VisitRating_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRating" ADD CONSTRAINT "VisitRating_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRating" ADD CONSTRAINT "VisitRating_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionRequest"
 ADD CONSTRAINT promotion_status CHECK (status IN ('PENDING','AWAITING_ACCEPTANCE','APPROVED','REJECTED','PAUSED','WITHDRAWN')),
 ADD CONSTRAINT promotion_fee CHECK ("feePiasters" IS NULL OR "feePiasters" BETWEEN 0 AND 999999999999),
 ADD CONSTRAINT promotion_version CHECK (version>0),
 ADD CONSTRAINT promotion_radius CHECK ("radiusKm" BETWEEN 1 AND 100),
 ADD CONSTRAINT promotion_schedule CHECK ("startsAt" IS NULL OR ("endsAt">"startsAt" AND "endsAt"<="startsAt"+interval '180 days')),
 ADD CONSTRAINT promotion_quote CHECK (status NOT IN ('AWAITING_ACCEPTANCE','APPROVED') OR ("feePiasters" IS NOT NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "reviewedById" IS NOT NULL)),
 ADD CONSTRAINT promotion_acceptance CHECK (status<>'APPROVED' OR ("acceptedById" IS NOT NULL AND "acceptedAt" IS NOT NULL));
ALTER TABLE "VisitRating" ADD CONSTRAINT rating_score CHECK (score BETWEEN 1 AND 5), ADD CONSTRAINT rating_version CHECK (version>0);
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PromotionRequest", "PromotionImage", "VisitRating" TO %I',r);
  END IF;
 END LOOP;
END $$;
