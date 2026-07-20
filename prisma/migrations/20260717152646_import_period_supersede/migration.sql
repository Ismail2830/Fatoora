-- DropForeignKey
ALTER TABLE "courier_report_lines" DROP CONSTRAINT "courier_report_lines_courierId_fkey";

-- AlterTable
ALTER TABLE "courier_report_lines" ALTER COLUMN "courierId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "discrepancies" ADD COLUMN     "importBatchId" TEXT;

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "discrepancies_importBatchId_idx" ON "discrepancies"("importBatchId");

-- CreateIndex
CREATE INDEX "import_batches_storeId_type_periodStart_idx" ON "import_batches"("storeId", "type", "periodStart");

-- AddForeignKey
ALTER TABLE "courier_report_lines" ADD CONSTRAINT "courier_report_lines_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
