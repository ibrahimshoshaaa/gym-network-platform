-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "operationId" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "receiptId" UUID,
    "clientKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "userId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateTable
CREATE TABLE "PlatformContact" (
    "id" TEXT NOT NULL DEFAULT 'support',
    "whatsapp" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRecovery" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuedById" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessImage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID,
    "purpose" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicket_userId_updatedAt_id_idx" ON "SupportTicket"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_id_idx" ON "SupportTicket"("status", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_clientKey_key" ON "SupportMessage"("clientKey");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_id_idx" ON "SupportMessage"("ticketId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AccountRecovery_tokenHash_key" ON "AccountRecovery"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountRecovery_userId_createdAt_idx" ON "AccountRecovery"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessImage_objectKey_key" ON "BusinessImage"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessImage_assetId_key" ON "BusinessImage"("assetId");

-- CreateIndex
CREATE INDEX "BusinessImage_gymId_branchId_purpose_idx" ON "BusinessImage"("gymId", "branchId", "purpose");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ReceiptEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecovery" ADD CONSTRAINT "AccountRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecovery" ADD CONSTRAINT "AccountRecovery_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessImage" ADD CONSTRAINT "BusinessImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessImage" ADD CONSTRAINT "BusinessImage_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessImage" ADD CONSTRAINT "BusinessImage_branchId_gymId_fkey" FOREIGN KEY ("branchId", "gymId") REFERENCES "Branch"("id", "gymId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_status_check" CHECK (status IN ('OPEN','WAITING_USER','WAITING_ADMIN','CLOSED'));
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_category_check" CHECK (category IN ('HELP','TOPUP','VISIT','WITHDRAWAL','REFUND','ACCOUNT'));
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_body_check" CHECK (length(btrim(body)) BETWEEN 5 AND 3000);
ALTER TABLE "AccountRecovery" ADD CONSTRAINT "AccountRecovery_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "BusinessImage" ADD CONSTRAINT "BusinessImage_kind_check" CHECK ((purpose='LOGO' AND "branchId" IS NULL) OR (purpose='PHOTO' AND "branchId" IS NOT NULL));
ALTER TABLE "BusinessImage" ADD CONSTRAINT "BusinessImage_url_check" CHECK ("publicUrl" LIKE 'https://res.cloudinary.com/%');
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_event_check" CHECK (length("eventId") BETWEEN 1 AND 200);

CREATE FUNCTION protect_support_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Support messages are immutable'; END $$;
CREATE TRIGGER "SupportMessage_immutable" BEFORE UPDATE OR DELETE ON "SupportMessage" FOR EACH ROW EXECUTE FUNCTION protect_support_message();

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON "SupportTicket","SupportMessage","NotificationRead","PlatformContact","AccountRecovery","BusinessImage" TO gym_api_service;
 END IF;
END $$;
