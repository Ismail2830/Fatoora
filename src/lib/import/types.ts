import type { ImportType, OrderStatus } from "@/generated/prisma/enums";

/** A file parsed into headers plus raw rows, before any interpretation. */
export type SheetData = {
  headers: string[];
  rows: RawRow[];
};

export type RawRow = Record<string, unknown>;

/** Canonical fields an order import can fill. */
export const ORDER_FIELDS = [
  "reference",
  "customerName",
  "phone",
  "city",
  "address",
  "productName",
  "productSku",
  "quantity",
  "totalAmount",
  "courier",
  "trackingNumber",
  "status",
  "orderedAt",
] as const;

export type OrderField = (typeof ORDER_FIELDS)[number];

/** Canonical fields a courier report can fill. */
export const REPORT_FIELDS = [
  "trackingNumber",
  "reference",
  "phone",
  "customerName",
  "city",
  // A single downloaded file often mixes several couriers, so the courier is a
  // per-row column here, not a choice made once for the whole upload.
  "courier",
  "status",
  "codAmount",
  "paidAmount",
  "fee",
  "reportDate",
] as const;

export type ReportField = (typeof REPORT_FIELDS)[number];

export type AnyField = OrderField | ReportField;

/**
 * Which source column feeds each canonical field. Null means "not provided" —
 * the seller explicitly left it unmapped, which is different from unmapped-yet.
 */
export type ColumnMap<F extends string = AnyField> = Partial<Record<F, string | null>>;

export type FieldSpec<F extends string> = {
  field: F;
  /** Shown in the mapping UI. */
  label: string;
  required: boolean;
  /**
   * Header names seen in the wild, normalized (lowercase, unaccented).
   * Used to pre-fill the mapping so most sellers never touch the UI.
   */
  aliases: string[];
  hint?: string;
};

/** One row's worth of problems, reported per-row so a bad file isn't all-or-nothing. */
export type RowIssue = {
  rowNumber: number;
  message: string;
  raw?: RawRow;
};

export type ParsedOrderRow = {
  reference: string;
  customerName: string;
  phone: string;
  city: string;
  address: string | null;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  totalAmount: number;
  courier: string | null;
  trackingNumber: string | null;
  status: string | null;
  orderedAt: Date | null;
};

export type ParsedReportRow = {
  trackingNumber: string | null;
  reference: string | null;
  phone: string | null;
  customerName: string | null;
  city: string | null;
  /** The courier text as written in the file, kept for debugging. */
  courierRaw: string | null;
  /** The store courier this row resolved to; null when unrecognised. */
  courierSlug: string | null;
  /** The courier's own wording, kept verbatim for debugging bad parses. */
  statusRaw: string | null;
  /** Null when we don't recognise the wording — see mapReportRows. */
  statusNormalized: OrderStatus | null;
  codAmount: number | null;
  paidAmount: number | null;
  fee: number | null;
  reportDate: Date | null;
};

export type ImportPreview<T> = {
  type: ImportType;
  mapping: ColumnMap;
  /** Rows that parsed cleanly and will be written. */
  valid: T[];
  /** Rows rejected outright, with the reason. Shown before anything is written. */
  issues: RowIssue[];
  /**
   * Rows that import fine but lost something along the way — an unrecognised
   * courier status, say. Kept separate from `issues` because dropping the row
   * would be worse than importing it imperfectly.
   */
  warnings: RowIssue[];
  totalRows: number;
};
