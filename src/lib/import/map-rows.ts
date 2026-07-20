import {
  canonicalCity,
  normalizePhone,
  normalizeStatus,
  parseAmount,
  parseDate,
} from "@/lib/reconciliation/normalize";

import { getCourierProfile, resolveCourierSlug, type StoreCourier } from "./couriers";
import type {
  ColumnMap,
  ImportPreview,
  OrderField,
  ParsedOrderRow,
  ParsedReportRow,
  RawRow,
  ReportField,
  RowIssue,
} from "./types";

/** Read a mapped cell as trimmed text, or null when absent/blank. */
function cell(row: RawRow, mapping: ColumnMap<never> | Record<string, string | null | undefined>, field: string): string | null {
  const header = (mapping as Record<string, string | null | undefined>)[field];
  if (!header) return null;
  const value = row[header];
  if (value === null || value === undefined) return null;
  const text = value instanceof Date ? value.toISOString() : String(value).trim();
  return text === "" ? null : text;
}

function rawCell(row: RawRow, mapping: Record<string, string | null | undefined>, field: string): unknown {
  const header = mapping[field];
  if (!header) return null;
  return row[header] ?? null;
}

/**
 * Turn mapped order rows into validated domain rows.
 *
 * Bad rows are collected rather than thrown: a seller with 400 orders and 3 bad
 * ones should import 397 and see exactly which 3 failed and why — an
 * all-or-nothing import is unusable against real spreadsheets.
 */
export function mapOrderRows(
  rows: RawRow[],
  mapping: ColumnMap<OrderField>,
): ImportPreview<ParsedOrderRow> {
  const map = mapping as Record<string, string | null | undefined>;
  const valid: ParsedOrderRow[] = [];
  const issues: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const seenReferences = new Set<string>();

  rows.forEach((row, i) => {
    // +2: row 1 is the header, and humans count from 1.
    const rowNumber = i + 2;
    const problems: string[] = [];

    const reference = cell(row, map, "reference");
    if (!reference) problems.push("N° de commande manquant");
    else if (seenReferences.has(reference)) {
      problems.push(`N° de commande en double dans le fichier : ${reference}`);
    }

    const customerName = cell(row, map, "customerName") ?? "";
    if (!customerName) problems.push("Nom du client manquant");

    const phoneRaw = cell(row, map, "phone");
    const phone = normalizePhone(phoneRaw);
    if (!phoneRaw) problems.push("Téléphone manquant");
    else if (!phone) problems.push(`Téléphone invalide : ${phoneRaw}`);

    const cityRaw = cell(row, map, "city");
    const city = canonicalCity(cityRaw);
    if (!city) problems.push("Ville manquante");

    const amountRaw = rawCell(row, map, "totalAmount");
    const totalAmount = parseAmount(amountRaw);
    if (totalAmount === null) {
      problems.push(`Montant illisible : ${amountRaw ?? "(vide)"}`);
    } else if (totalAmount < 0) {
      problems.push("Montant négatif");
    }

    if (problems.length) {
      issues.push({ rowNumber, message: problems.join(" · "), raw: row });
      return;
    }

    const quantityRaw = parseAmount(rawCell(row, map, "quantity"));
    // A missing or nonsensical quantity means one item, not zero items.
    const quantity = quantityRaw && quantityRaw > 0 ? Math.round(quantityRaw) : 1;

    seenReferences.add(reference!);

    valid.push({
      reference: reference!,
      customerName,
      phone: phone!,
      city: city!,
      address: cell(row, map, "address"),
      productName: cell(row, map, "productName"),
      productSku: cell(row, map, "productSku"),
      quantity,
      totalAmount: totalAmount!,
      courier: cell(row, map, "courier"),
      trackingNumber: cell(row, map, "trackingNumber"),
      status: cell(row, map, "status"),
      orderedAt: parseDate(rawCell(row, map, "orderedAt")),
    });
  });

  return { type: "ORDERS", mapping, valid, issues, warnings, totalRows: rows.length };
}

/**
 * How to decide each row's courier.
 *
 *  - a slug string: every row is that courier (single-courier upload).
 *  - `{ couriers, fallbackSlug? }`: resolve per row from the mapped "courier"
 *    column, because one downloaded file mixes several couriers. fallbackSlug
 *    covers rows whose courier column is blank or unrecognised.
 */
export type CourierResolution =
  | string
  | { couriers: StoreCourier[]; fallbackSlug?: string };

/**
 * Turn mapped courier-report rows into validated rows.
 *
 * A report line is only useful if it can be matched to an order, so a line with
 * no tracking number, reference *or* phone is rejected outright — there is
 * nothing to reconcile it against.
 */
export function mapReportRows(
  rows: RawRow[],
  mapping: ColumnMap<ReportField>,
  courier: CourierResolution,
): ImportPreview<ParsedReportRow> {
  const map = mapping as Record<string, string | null | undefined>;
  const valid: ParsedReportRow[] = [];
  const issues: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  const single = typeof courier === "string" ? courier : null;
  const perRow = typeof courier === "string" ? null : courier;

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const problems: string[] = [];

    const trackingNumber = cell(row, map, "trackingNumber");
    const reference = cell(row, map, "reference");
    const phone = normalizePhone(cell(row, map, "phone"));

    if (!trackingNumber && !reference && !phone) {
      problems.push(
        "Aucun identifiant (suivi, commande ou téléphone) — impossible à rapprocher",
      );
    }

    const statusRaw = cell(row, map, "status");
    if (!statusRaw) problems.push("Statut manquant");

    if (problems.length) {
      issues.push({ rowNumber, message: problems.join(" · "), raw: row });
      return;
    }

    // Resolve this row's courier before reading its status, since the courier's
    // vocabulary decides how the status is read.
    const courierRaw = cell(row, map, "courier");
    let courierSlug: string | null;
    if (single) {
      courierSlug = single;
    } else {
      courierSlug =
        resolveCourierSlug(courierRaw, perRow!.couriers) ?? perRow!.fallbackSlug ?? null;
      if (courierRaw && !resolveCourierSlug(courierRaw, perRow!.couriers)) {
        warnings.push({
          rowNumber,
          message: `Courier non reconnu : « ${courierRaw} » — rapproché sans profil courier.`,
          raw: row,
        });
      }
    }

    const profile = getCourierProfile(courierSlug ?? "generic");

    // The courier's own vocabulary takes precedence over the generic patterns.
    const statusNormalized = normalizeStatus(statusRaw, profile.statusWords);

    if (!statusNormalized) {
      // Import the line anyway — it still carries the amounts, and hiding it
      // would understate what the courier owes. But say so loudly, because an
      // unread status is how a courier's wording change goes unnoticed.
      warnings.push({
        rowNumber,
        message: `Statut non reconnu : « ${statusRaw} » — ligne importée sans statut.`,
        raw: row,
      });
    }

    valid.push({
      trackingNumber,
      reference,
      phone,
      customerName: cell(row, map, "customerName"),
      city: canonicalCity(cell(row, map, "city")),
      courierRaw,
      courierSlug: courierSlug === "generic" ? null : courierSlug,
      statusRaw,
      statusNormalized,
      codAmount: parseAmount(rawCell(row, map, "codAmount")),
      paidAmount: parseAmount(rawCell(row, map, "paidAmount")),
      fee: parseAmount(rawCell(row, map, "fee")),
      reportDate: parseDate(rawCell(row, map, "reportDate")),
    });
  });

  return {
    type: "COURIER_REPORT",
    mapping,
    valid,
    issues,
    warnings,
    totalRows: rows.length,
  };
}
