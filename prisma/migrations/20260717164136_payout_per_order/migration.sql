-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE INDEX "payouts_orderId_idx" ON "payouts"("orderId");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
