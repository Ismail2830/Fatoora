import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { reconcile, type EngineLine, type EngineOrder } from "@/lib/reconciliation/engine";
import type { FeeRule } from "@/lib/reconciliation/fees";
import type { ParsedReportRow } from "./types";

/**
 * Persist a parsed courier report and reconcile it — the step that turns an
 * upload into an answer.
 *
 * The contract:
 *  - The seller says which period the report covers. Re-importing an
 *    overlapping period supersedes the earlier batch (delete + recompute), so
 *    a re-upload can never double-count payments.
 *  - Committing runs the reconciliation engine, applies the order updates, and
 *    writes the discrepancies. The caller gets back the money, not a row count.
 */

export type CommitInput = {
  storeId: string;
  fileName: string;
  fileBytes: ArrayBuffer | Buffer;
  mapping: Record<string, string | null | undefined>;
  periodStart: Date;
  periodEnd: Date;
  rows: ParsedReportRow[];
  errorCount: number;
  /** Proceed even if an identical file was already imported. */
  force?: boolean;
};

export type CommitResult =
  | {
      ok: true;
      batchId: string;
      superseded: number;
      stats: {
        linesTotal: number;
        linesMatched: number;
        linesUnmatched: number;
        ordersUpdated: number;
        discrepancies: number;
        deliveredNotPaid: number;
        missingAmount: number;
      };
    }
  | { ok: false; reason: "duplicate"; existingBatchId: string; importedAt: string }
  | { ok: false; reason: "error"; message: string };

export function hashFile(bytes: ArrayBuffer | Buffer): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(new Uint8Array(bytes));
  return createHash("sha256").update(buf).digest("hex");
}

export async function commitCourierReport(input: CommitInput): Promise<CommitResult> {
  const { storeId } = input;
  const fileHash = hashFile(input.fileBytes);

  // Exact re-upload guard. A corrected re-export has a different hash and falls
  // through to the period supersede below; this only catches the literal
  // same-file-again click, which is the most common way a double happens.
  if (!input.force) {
    const dup = await db.importBatch.findFirst({
      where: { storeId, type: "COURIER_REPORT", fileHash, status: { not: "FAILED" } },
      select: { id: true, createdAt: true },
    });
    if (dup) {
      return {
        ok: false,
        reason: "duplicate",
        existingBatchId: dup.id,
        importedAt: dup.createdAt.toISOString(),
      };
    }
  }

  // Resolve courier slugs on the parsed rows to real courier ids up front.
  const couriers = await db.courier.findMany({
    where: { storeId },
    select: { id: true, slug: true, feeRules: true },
  });
  const courierIdBySlug = new Map(couriers.map((c) => [c.slug, c.id]));
  const feeRulesByCourierId: Record<string, FeeRule[]> = Object.fromEntries(
    couriers.map((c) => [
      c.id,
      c.feeRules.map((r) => ({
        city: r.city,
        deliveredFee: r.deliveredFee,
        returnFee: r.returnFee,
        codPercent: r.codPercent,
      })),
    ]),
  );

  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { stuckAfterDays: true },
  });
  const stuckAfterDays = store?.stuckAfterDays ?? 7;

  try {
    const result = await db.$transaction(
      async (tx) => {
        // Supersede any earlier report batch whose period overlaps this one.
        // Cascades take its report lines and the discrepancies it created, so
        // the missing-cash total can't carry a ghost from the replaced version.
        const overlapping = await tx.importBatch.findMany({
          where: {
            storeId,
            type: "COURIER_REPORT",
            periodStart: { lte: input.periodEnd },
            periodEnd: { gte: input.periodStart },
          },
          select: { id: true },
        });
        let superseded = 0;
        if (overlapping.length) {
          const res = await tx.importBatch.deleteMany({
            where: { id: { in: overlapping.map((b) => b.id) } },
          });
          superseded = res.count;
        }

        const batch = await tx.importBatch.create({
          data: {
            storeId,
            type: "COURIER_REPORT",
            fileName: input.fileName,
            fileHash,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            mapping: input.mapping,
            rowCount: input.rows.length + input.errorCount,
            successCount: input.rows.length,
            errorCount: input.errorCount,
            status: "PROCESSING",
          },
        });

        // Insert the report lines. Keep the created ids so the engine's matches
        // and discrepancies can point back at them.
        const lineRecords = input.rows.map((r) => ({
          storeId,
          batchId: batch.id,
          courierId: r.courierSlug ? (courierIdBySlug.get(r.courierSlug) ?? null) : null,
          trackingNumber: r.trackingNumber,
          phone: r.phone,
          reference: r.reference,
          statusRaw: r.statusRaw,
          statusNormalized: r.statusNormalized,
          codAmount: r.codAmount,
          paidAmount: r.paidAmount,
          fee: r.fee,
          reportDate: r.reportDate,
        }));

        await tx.courierReportLine.createMany({ data: lineRecords });

        const lines = await tx.courierReportLine.findMany({
          where: { batchId: batch.id },
          select: {
            id: true,
            courierId: true,
            trackingNumber: true,
            phone: true,
            reference: true,
            statusNormalized: true,
            codAmount: true,
            paidAmount: true,
            reportDate: true,
          },
        });

        // Candidate orders: everything already handed to a courier. An order
        // still with the seller can't appear in a courier's report.
        const orders = await tx.order.findMany({
          where: { storeId, shippedAt: { not: null } },
          select: {
            id: true,
            reference: true,
            phone: true,
            city: true,
            trackingNumber: true,
            courierId: true,
            totalAmount: true,
            status: true,
            paymentStatus: true,
            shippedAt: true,
            orderedAt: true,
          },
        });

        const engineOrders: EngineOrder[] = orders.map((o) => ({ ...o }));
        const engineLines: EngineLine[] = lines.map((l) => ({
          id: l.id,
          courierId: l.courierId,
          trackingNumber: l.trackingNumber,
          phone: l.phone,
          reference: l.reference,
          statusNormalized: l.statusNormalized,
          codAmount: l.codAmount,
          paidAmount: l.paidAmount,
          reportDate: l.reportDate,
        }));

        const recon = reconcile({
          orders: engineOrders,
          lines: engineLines,
          feeRules: feeRulesByCourierId,
          stuckAfterDays,
          now: new Date(),
        });

        // Record which order each line matched, for the audit trail and the
        // detail drawer.
        for (const m of recon.matches) {
          await tx.courierReportLine.update({
            where: { id: m.lineId },
            data: { orderId: m.orderId, matchedBy: m.matchedBy },
          });
        }

        // Apply the verdicts to the orders.
        for (const u of recon.orderUpdates) {
          await tx.order.update({
            where: { id: u.orderId },
            data: {
              status: u.status,
              paymentStatus: u.paymentStatus,
              amountPaid: u.amountPaid,
              courierFee: u.courierFee,
              deliveredAt: u.deliveredAt ?? undefined,
              paidAt: u.paidAt ?? undefined,
            },
          });
        }

        // Write this run's discrepancies, owned by the batch so a later
        // supersede cleans them up.
        if (recon.discrepancies.length) {
          await tx.discrepancy.createMany({
            data: recon.discrepancies.map((d) => ({
              storeId,
              importBatchId: batch.id,
              orderId: d.orderId ?? null,
              reportLineId: d.reportLineId ?? null,
              type: d.type,
              amount: d.amount,
              detail: d.detail,
            })),
          });
        }

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: input.errorCount > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          },
        });

        const deliveredNotPaid = recon.discrepancies.filter(
          (d) => d.type === "DELIVERED_NOT_PAID",
        ).length;

        return {
          batchId: batch.id,
          superseded,
          stats: {
            linesTotal: recon.stats.linesTotal,
            linesMatched: recon.stats.linesMatched,
            linesUnmatched: recon.stats.linesUnmatched,
            ordersUpdated: recon.orderUpdates.length,
            discrepancies: recon.discrepancies.length,
            deliveredNotPaid,
            missingAmount: recon.stats.missingAmount.toNumber(),
          },
        };
      },
      { timeout: 30_000 },
    );

    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "Erreur inconnue.",
    };
  }
}
