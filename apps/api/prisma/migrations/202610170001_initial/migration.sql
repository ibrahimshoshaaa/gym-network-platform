-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'GYM_OWNER', 'BRANCH_MANAGER', 'CASHIER', 'TRAINEE');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PointAccountType" AS ENUM ('ISSUANCE', 'BRANCH_INVENTORY', 'TRAINEE_WALLET', 'REDEEMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PointTxKind" AS ENUM ('ISSUE', 'TRANSFER', 'VISIT', 'VISIT_REVERSAL', 'SALE_REVERSAL', 'EXPIRY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MoneyAccountType" AS ENUM ('PLATFORM_OFFSET', 'GYM_AVAILABLE', 'GYM_RESERVED', 'GYM_DISPUTED', 'GYM_PAID');

-- CreateEnum
CREATE TYPE "MoneyTxKind" AS ENUM ('VISIT_SETTLEMENT', 'VISIT_REVERSAL', 'WITHDRAWAL_RESERVE', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID', 'DISPUTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gym" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'PENDING',
    "visitPricePoints" INTEGER NOT NULL,
    "sessionMinutes" INTEGER NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointAccount" (
    "id" UUID NOT NULL,
    "type" "PointAccountType" NOT NULL,
    "ownerUserId" UUID,
    "branchId" UUID,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" UUID,
    "kind" "PointTxKind" NOT NULL,
    "actorId" UUID,
    "referenceId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointPosting" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,

    CONSTRAINT "PointPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopupRequest" (
    "id" UUID NOT NULL,
    "requestorUserId" UUID NOT NULL,
    "receivingBranchId" UUID,
    "points" INTEGER NOT NULL,
    "chargePiasters" BIGINT NOT NULL,
    "receiptObjectKey" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" UUID NOT NULL,
    "traineeId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "pointsCharged" INTEGER NOT NULL,
    "settlementPiasters" BIGINT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancellationReason" TEXT,
    "pointTransactionId" UUID NOT NULL,
    "moneyTransactionId" UUID NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyAccount" (
    "id" UUID NOT NULL,
    "type" "MoneyAccountType" NOT NULL,
    "gymId" UUID,
    "branchId" UUID,
    "balancePiasters" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyTransaction" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "actorId" UUID NOT NULL,
    "reversalOfId" UUID,
    "kind" "MoneyTxKind" NOT NULL,
    "referenceId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyPosting" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "deltaPiasters" BIGINT NOT NULL,

    CONSTRAINT "MoneyPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID,
    "amountPiasters" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "transferProofKey" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

-- CreateIndex
CREATE INDEX "Gym_ownerId_idx" ON "Gym"("ownerId");

-- CreateIndex
CREATE INDEX "Branch_gymId_status_idx" ON "Branch"("gymId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_id_gymId_key" ON "Branch"("id", "gymId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_userId_branchId_role_key" ON "StaffAssignment"("userId", "branchId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PointAccount_type_ownerUserId_key" ON "PointAccount"("type", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PointAccount_type_branchId_key" ON "PointAccount"("type", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_idempotencyKey_key" ON "PointTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_reversalOfId_key" ON "PointTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "PointTransaction_referenceId_idx" ON "PointTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "PointPosting_accountId_idx" ON "PointPosting"("accountId");

-- CreateIndex
CREATE INDEX "PointPosting_transactionId_idx" ON "PointPosting"("transactionId");

-- CreateIndex
CREATE INDEX "TopupRequest_status_createdAt_idx" ON "TopupRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_pointTransactionId_key" ON "Visit"("pointTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_moneyTransactionId_key" ON "Visit"("moneyTransactionId");

-- CreateIndex
CREATE INDEX "Visit_traineeId_branchId_status_idx" ON "Visit"("traineeId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Visit_branchId_startedAt_idx" ON "Visit"("branchId", "startedAt");

-- CreateIndex
CREATE INDEX "MoneyAccount_type_gymId_branchId_idx" ON "MoneyAccount"("type", "gymId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransaction_idempotencyKey_key" ON "MoneyTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransaction_reversalOfId_key" ON "MoneyTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "MoneyTransaction_referenceId_idx" ON "MoneyTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "MoneyPosting_accountId_idx" ON "MoneyPosting"("accountId");

-- CreateIndex
CREATE INDEX "MoneyPosting_transactionId_idx" ON "MoneyPosting"("transactionId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_gymId_status_idx" ON "WithdrawalRequest"("gymId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Gym" ADD CONSTRAINT "Gym_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAccount" ADD CONSTRAINT "PointAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAccount" ADD CONSTRAINT "PointAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "PointTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointPosting" ADD CONSTRAINT "PointPosting_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PointTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointPosting" ADD CONSTRAINT "PointPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PointAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_receivingBranchId_fkey" FOREIGN KEY ("receivingBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_pointTransactionId_fkey" FOREIGN KEY ("pointTransactionId") REFERENCES "PointTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_moneyTransactionId_fkey" FOREIGN KEY ("moneyTransactionId") REFERENCES "MoneyTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_branchId_gymId_fkey" FOREIGN KEY ("branchId", "gymId") REFERENCES "Branch"("id", "gymId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "MoneyTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "MoneyTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyPosting" ADD CONSTRAINT "MoneyPosting_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MoneyTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyPosting" ADD CONSTRAINT "MoneyPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_branchId_gymId_fkey" FOREIGN KEY ("branchId", "gymId") REFERENCES "Branch"("id", "gymId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

