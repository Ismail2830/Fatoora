-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('MANUAL', 'IMPORT', 'API');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('TO_CONFIRM', 'CONFIRMED', 'NO_ANSWER', 'CALLBACK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('TOO_EXPENSIVE', 'CHANGED_MIND', 'WRONG_NUMBER', 'UNREACHABLE', 'DUPLICATE', 'TEST_ORDER', 'OTHER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelReason" "CancelReason",
ADD COLUMN     "confirmationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "confirmationStatus" "ConfirmationStatus",
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "nextCallAt" TIMESTAMP(3),
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'IMPORT';

-- CreateTable
CREATE TABLE "confirmation_attempts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "outcome" "ConfirmationStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "confirmation_attempts_orderId_idx" ON "confirmation_attempts"("orderId");

-- CreateIndex
CREATE INDEX "confirmation_attempts_userId_createdAt_idx" ON "confirmation_attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_storeId_confirmationStatus_nextCallAt_idx" ON "orders"("storeId", "confirmationStatus", "nextCallAt");

-- AddForeignKey
ALTER TABLE "confirmation_attempts" ADD CONSTRAINT "confirmation_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmation_attempts" ADD CONSTRAINT "confirmation_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
