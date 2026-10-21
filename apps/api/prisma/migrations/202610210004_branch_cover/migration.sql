-- Preserve logos and gallery photos while adding one replaceable cover per branch.
ALTER TABLE "BusinessImage" DROP CONSTRAINT "BusinessImage_kind_check";
ALTER TABLE "BusinessImage" ADD CONSTRAINT "BusinessImage_kind_check" CHECK ((purpose='LOGO' AND "branchId" IS NULL) OR (purpose IN ('PHOTO','COVER') AND "branchId" IS NOT NULL));
CREATE UNIQUE INDEX "BusinessImage_one_branch_cover" ON "BusinessImage"("branchId") WHERE purpose='COVER';
