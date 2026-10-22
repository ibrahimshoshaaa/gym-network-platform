ALTER TABLE "Branch" ADD COLUMN "entryQrToken" TEXT, ADD COLUMN "entryQrVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Branch_entryQrToken_key" ON "Branch"("entryQrToken");
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_entry_qr_check" CHECK (("entryQrToken" IS NULL AND "entryQrVersion"=0) OR ("entryQrToken" IS NOT NULL AND "entryQrToken" ~ '^[A-Za-z0-9_-]{43}$' AND "entryQrVersion">0));
