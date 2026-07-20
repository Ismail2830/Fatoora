import "server-only";

import { db } from "@/lib/db";

/** Import history for the Import Center, most recent first. */
export async function getImportHistory(storeId: string, limit = 20) {
  const batches = await db.importBatch.findMany({
    where: { storeId, type: "COURIER_REPORT" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      periodStart: true,
      periodEnd: true,
      rowCount: true,
      successCount: true,
      errorCount: true,
      status: true,
      createdAt: true,
      _count: { select: { reportLines: true, discrepancies: true } },
    },
  });

  return batches.map((b) => ({
    id: b.id,
    fileName: b.fileName,
    periodStart: b.periodStart?.toISOString() ?? null,
    periodEnd: b.periodEnd?.toISOString() ?? null,
    rowCount: b.rowCount,
    successCount: b.successCount,
    errorCount: b.errorCount,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    lineCount: b._count.reportLines,
    discrepancyCount: b._count.discrepancies,
  }));
}
