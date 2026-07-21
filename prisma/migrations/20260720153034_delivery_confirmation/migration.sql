-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryConfirmedById" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryConfirmedById_fkey" FOREIGN KEY ("deliveryConfirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
