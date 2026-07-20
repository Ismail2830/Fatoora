"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireMoneyAccess } from "@/lib/session";
import { readSheet, ImportFileError } from "@/lib/import/read-file";
import { detectMapping, missingRequired } from "@/lib/import/detect";
import { REPORT_FIELD_SPECS } from "@/lib/import/fields";
import { mapReportRows } from "@/lib/import/map-rows";
import type { StoreCourier } from "@/lib/import/couriers";
import { commitCourierReport } from "@/lib/import/commit-report";
import type { ColumnMap, ReportField } from "@/lib/import/types";

/**
 * Import is money-side: it rewrites payment status and discrepancies, so a
 * confirmatrice must never reach it. Every action here guards.
 */

export type AnalyzeResult =
  | {
      ok: true;
      headers: string[];
      sampleRows: Record<string, string>[];
      mapping: ColumnMap<ReportField>;
      missingRequired: string[];
      hasCourierColumn: boolean;
      couriers: StoreCourier[];
      totalRows: number;
    }
  | { ok: false; error: string };

/** Read the file, detect columns, and hand back a preview of the mapping. */
export async function analyzeReport(formData: FormData): Promise<AnalyzeResult> {
  const session = await requireMoneyAccess();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const bytes = await file.arrayBuffer();

  let sheet;
  try {
    sheet = readSheet(file.name, bytes);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ImportFileError ? e.message : "Fichier illisible.",
    };
  }

  const couriers = await db.courier.findMany({
    where: { storeId: session.storeId },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });

  const mapping = detectMapping(sheet.headers, REPORT_FIELD_SPECS);

  // Only the first few rows travel to the client — enough to preview the
  // mapping, not the whole file.
  const sampleRows = sheet.rows.slice(0, 5).map((row) => {
    const out: Record<string, string> = {};
    for (const h of sheet.headers) {
      const v = row[h];
      out[h] = v === null || v === undefined ? "" : String(v);
    }
    return out;
  });

  return {
    ok: true,
    headers: sheet.headers,
    sampleRows,
    mapping,
    missingRequired: missingRequired(mapping, REPORT_FIELD_SPECS).map((s) => s.label),
    hasCourierColumn: Boolean(mapping.courier),
    couriers,
    totalRows: sheet.rows.length,
  };
}

export type PreviewResult =
  | {
      ok: true;
      valid: number;
      issues: { rowNumber: number; message: string }[];
      warnings: { rowNumber: number; message: string }[];
      total: number;
      // How many rows resolved to each courier, so the seller sees the file
      // really did contain the couriers they expect.
      courierBreakdown: { slug: string | null; label: string; count: number }[];
    }
  | { ok: false; error: string };

/**
 * Parse the whole file under the confirmed mapping and report what will happen
 * before anything is written — the seller sees the damage before the commit.
 */
export async function previewReport(
  formData: FormData,
  mapping: ColumnMap<ReportField>,
  fallbackSlug: string | null,
): Promise<PreviewResult> {
  const session = await requireMoneyAccess();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const bytes = await file.arrayBuffer();
  let sheet;
  try {
    sheet = readSheet(file.name, bytes);
  } catch (e) {
    return { ok: false, error: e instanceof ImportFileError ? e.message : "Fichier illisible." };
  }

  const couriers = await db.courier.findMany({
    where: { storeId: session.storeId },
    select: { id: true, slug: true, name: true },
  });

  const preview = mapReportRows(sheet.rows, mapping, {
    couriers,
    fallbackSlug: fallbackSlug ?? undefined,
  });

  const labelBySlug = new Map(couriers.map((c) => [c.slug, c.name]));
  const counts = new Map<string | null, number>();
  for (const row of preview.valid) {
    counts.set(row.courierSlug, (counts.get(row.courierSlug) ?? 0) + 1);
  }
  const courierBreakdown = [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: slug ? (labelBySlug.get(slug) ?? slug) : "Courier non reconnu",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    valid: preview.valid.length,
    issues: preview.issues.map((i) => ({ rowNumber: i.rowNumber, message: i.message })),
    warnings: preview.warnings.map((w) => ({ rowNumber: w.rowNumber, message: w.message })),
    total: preview.totalRows,
    courierBreakdown,
  };
}

export type ImportResult =
  | {
      ok: true;
      batchId: string;
      superseded: number;
      linesMatched: number;
      linesUnmatched: number;
      ordersUpdated: number;
      deliveredNotPaid: number;
      missingAmount: number;
    }
  | { ok: false; reason: "duplicate"; importedAt: string }
  | { ok: false; reason: "error"; error: string };

/** Persist + reconcile. Ends with the money, not a row count. */
export async function runImport(
  formData: FormData,
  mapping: ColumnMap<ReportField>,
  fallbackSlug: string | null,
  periodStartISO: string,
  periodEndISO: string,
  force: boolean,
): Promise<ImportResult> {
  const session = await requireMoneyAccess();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, reason: "error", error: "Aucun fichier reçu." };

  const bytes = await file.arrayBuffer();
  let sheet;
  try {
    sheet = readSheet(file.name, bytes);
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      error: e instanceof ImportFileError ? e.message : "Fichier illisible.",
    };
  }

  const couriers = await db.courier.findMany({
    where: { storeId: session.storeId },
    select: { id: true, slug: true, name: true },
  });

  const preview = mapReportRows(sheet.rows, mapping, {
    couriers,
    fallbackSlug: fallbackSlug ?? undefined,
  });

  const result = await commitCourierReport({
    storeId: session.storeId,
    fileName: file.name,
    fileBytes: bytes,
    mapping: mapping as Record<string, string | null | undefined>,
    periodStart: new Date(periodStartISO),
    periodEnd: new Date(periodEndISO),
    rows: preview.valid,
    errorCount: preview.issues.length,
    force,
  });

  if (!result.ok && result.reason === "duplicate") {
    return { ok: false, reason: "duplicate", importedAt: result.importedAt };
  }
  if (!result.ok) {
    return { ok: false, reason: "error", error: result.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/import");
  revalidatePath("/app/orders");
  revalidatePath("/app/reconciliation");

  return {
    ok: true,
    batchId: result.batchId,
    superseded: result.superseded,
    linesMatched: result.stats.linesMatched,
    linesUnmatched: result.stats.linesUnmatched,
    ordersUpdated: result.stats.ordersUpdated,
    deliveredNotPaid: result.stats.deliveredNotPaid,
    missingAmount: result.stats.missingAmount,
  };
}

/** Undo an import: delete the batch, which cascades its lines + discrepancies. */
export async function undoImport(batchId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMoneyAccess();
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, storeId: session.storeId },
    select: { id: true },
  });
  if (!batch) return { ok: false, error: "Import introuvable." };

  // Note: order payment fields set by this import are not rolled back here —
  // superseding via a fresh import recomputes them. A standalone undo clears
  // the report lines and discrepancies, which is what removes the false money.
  await db.importBatch.delete({ where: { id: batch.id } });

  revalidatePath("/app/import");
  revalidatePath("/app/reconciliation");
  return { ok: true };
}
