import Papa from "papaparse";
import * as XLSX from "xlsx";

import type { RawRow, SheetData } from "./types";

/**
 * Turn an uploaded CSV/Excel file into headers + rows.
 *
 * Sellers export from Shopify, WooCommerce, Google Sheets, or type it by hand,
 * so the only safe assumption is that the first non-empty row is the header.
 */

export class ImportFileError extends Error {}

const EXCEL_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods"];

export function isExcelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return EXCEL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Fold a header to a comparable key: "N° Commande" -> "n commande".
 *
 * Every non-alphanumeric run collapses to a single space, which is what makes
 * "N°", "N.", "N -" and "No" all land on the same key. French sellers write
 * "N°" constantly, and the degree sign is not an accent, so stripping
 * diacritics alone leaves it behind and every alias misses.
 */
export function normalizeHeader(header: string): string {
  return String(header)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Drop rows where every cell is blank — Excel files are full of them. */
function isEmptyRow(row: RawRow): boolean {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === "",
  );
}

/** Ensure headers are unique and non-empty so rows can be keyed by them. */
function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, i) => {
    const base = String(raw ?? "").trim() || `Colonne ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    // A duplicated header would otherwise silently overwrite the first column.
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

export function readExcel(buffer: ArrayBuffer | Buffer): SheetData {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  } catch {
    throw new ImportFileError("Fichier Excel illisible ou corrompu.");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ImportFileError("Le fichier ne contient aucune feuille.");

  const sheet = workbook.Sheets[sheetName];

  // header:1 gives us arrays, so we control which row becomes the header
  // instead of letting the library guess.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: false,
  });

  const firstFilled = matrix.findIndex(
    (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""),
  );
  if (firstFilled === -1) throw new ImportFileError("Le fichier est vide.");

  const headers = dedupeHeaders((matrix[firstFilled] as unknown[]).map((h) => String(h ?? "")));

  const rows: RawRow[] = [];
  for (const line of matrix.slice(firstFilled + 1)) {
    if (!Array.isArray(line)) continue;
    const row: RawRow = {};
    headers.forEach((h, i) => {
      row[h] = line[i] ?? null;
    });
    if (!isEmptyRow(row)) rows.push(row);
  }

  return { headers, rows };
}

export function readCsv(text: string): SheetData {
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    // Moroccan exports are often semicolon-delimited because of French Excel;
    // letting Papa sniff the delimiter handles , ; and tab alike.
    delimiter: "",
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.data.length) {
    const first = parsed.errors[0];
    throw new ImportFileError(
      first ? `CSV illisible : ${first.message}` : "Le fichier est vide.",
    );
  }

  const headers = dedupeHeaders(parsed.meta.fields ?? []);
  const rows = parsed.data.filter((r) => !isEmptyRow(r));

  return { headers, rows };
}

/** Read whatever the seller uploaded. */
export function readSheet(fileName: string, data: ArrayBuffer | Buffer | string): SheetData {
  if (isExcelFile(fileName)) {
    if (typeof data === "string") {
      throw new ImportFileError("Un fichier Excel doit être lu en binaire.");
    }
    return readExcel(data);
  }

  const text =
    typeof data === "string" ? data : new TextDecoder("utf-8").decode(data as ArrayBuffer);

  return readCsv(stripBom(text));
}

/** Excel writes a UTF-8 BOM that would otherwise corrupt the first header. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
