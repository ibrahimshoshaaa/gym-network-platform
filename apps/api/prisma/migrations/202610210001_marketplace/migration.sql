CREATE TABLE "MarketListing" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "pricePiasters" BIGINT NOT NULL,
    "governorate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "clientKey" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "reviewReason" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketImage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "listingId" UUID,
    "objectKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketReport" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketListing_status_createdAt_id_idx" ON "MarketListing"("status", "createdAt", "id");

CREATE INDEX "MarketListing_status_pricePiasters_id_idx" ON "MarketListing"("status", "pricePiasters", "id");

CREATE INDEX "MarketListing_sellerId_createdAt_idx" ON "MarketListing"("sellerId", "createdAt");

CREATE UNIQUE INDEX "MarketListing_sellerId_clientKey_key" ON "MarketListing"("sellerId", "clientKey");

CREATE UNIQUE INDEX "MarketImage_objectKey_key" ON "MarketImage"("objectKey");

CREATE UNIQUE INDEX "MarketImage_assetId_key" ON "MarketImage"("assetId");

CREATE INDEX "MarketImage_listingId_createdAt_idx" ON "MarketImage"("listingId", "createdAt");

CREATE INDEX "MarketReport_status_createdAt_idx" ON "MarketReport"("status", "createdAt");

CREATE UNIQUE INDEX "MarketReport_listingId_reporterId_key" ON "MarketReport"("listingId", "reporterId");

ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketImage" ADD CONSTRAINT "MarketImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketImage" ADD CONSTRAINT "MarketImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketReport" ADD CONSTRAINT "MarketReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketReport" ADD CONSTRAINT "MarketReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_status_check" CHECK (status IN ('PENDING','APPROVED','REJECTED','HIDDEN','SOLD')),
 ADD CONSTRAINT "MarketListing_category_check" CHECK (category IN ('EQUIPMENT','WEIGHTS','ACCESSORIES','CLOTHING')),
 ADD CONSTRAINT "MarketListing_condition_check" CHECK (condition IN ('NEW','USED')),
 ADD CONSTRAINT "MarketListing_price_check" CHECK ("pricePiasters">=0 AND "pricePiasters"<=999999999999),
 ADD CONSTRAINT "MarketListing_version_check" CHECK (version>0);
ALTER TABLE "MarketReport" ADD CONSTRAINT "MarketReport_status_check" CHECK (status IN ('OPEN','REVIEWED'));
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "MarketListing", "MarketImage", "MarketReport" TO %I',r);
  END IF;
 END LOOP;
END $$;
