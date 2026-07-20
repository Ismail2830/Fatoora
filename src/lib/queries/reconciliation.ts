import "server-only";

import { db } from "@/lib/db";
import { round, sum } from "@/lib/money";
import type { DiscrepancyStatus, DiscrepancyType } from "@/generated/prisma/enums";

/**
 * Types where the courier owes real money — these drive the headline "missing
 * cash" figure. The rest are informational (a cost already applied) or need
 * investigation rather than a payment.
 */
const RECEIVABLE_TYPES: DiscrepancyType[] = ["DELIVERED_NOT_PAID", "AMOUNT_MISMATCH", "LOST"];
const INVESTIGATE_TYPES: DiscrepancyType[] = [
  "UNMATCHED_REPORT_LINE",
  "UNMATCHED_ORDER",
  "STUCK_IN_TRANSIT",
  "PAID_NOT_DELIVERED",
];
const COST_TYPES: DiscrepancyType[] = ["RETURN_FEE_CHARGED"];

export async function getReconciliationSummary(storeId: string) {
  const open = await db.discrepancy.findMany({
    where: { storeId, status: "OPEN" },
    select: { type: true, amount: true },
  });

  const receivable = sum(
    open.filter((d) => RECEIVABLE_TYPES.includes(d.type)).map((d) => d.amount),
  );
  const toInvestigate = open.filter((d) => INVESTIGATE_TYPES.includes(d.type)).length;
  const costs = sum(open.filter((d) => COST_TYPES.includes(d.type)).map((d) => d.amount));

  return {
    receivableAmount: round(receivable),
    receivableCount: open.filter((d) => RECEIVABLE_TYPES.includes(d.type)).length,
    toInvestigate,
    costsAmount: round(costs),
    totalOpen: open.length,
  };
}

export type ReconciliationFilters = {
  type?: DiscrepancyType;
  courierId?: string;
  status: DiscrepancyStatus;
};

/**
 * Open discrepancies grouped by courier, each group subtotalled and sorted by
 * amount — because a courier's per-order transfer gets checked against that
 * courier's list specifically, not a list mixed with everyone else's.
 * Courier groups are sorted by subtotal descending, and rows within a group
 * the same way: biggest gap first is what to chase first.
 */
export async function getDiscrepancyGroups(storeId: string, filters: ReconciliationFilters) {
  const rows = await db.discrepancy.findMany({
    where: {
      storeId,
      status: filters.status,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.courierId
        ? { order: { courierId: filters.courierId } }
        : {}),
    },
    orderBy: { amount: "desc" },
    select: {
      id: true,
      type: true,
      amount: true,
      detail: true,
      status: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          reference: true,
          customerName: true,
          city: true,
          trackingNumber: true,
          courier: { select: { id: true, name: true } },
        },
      },
      reportLine: {
        select: { id: true, trackingNumber: true, phone: true, courier: { select: { id: true, name: true } } },
      },
    },
  });

  type Row = (typeof rows)[number];
  const groups = new Map<string, { courierId: string | null; courierName: string; rows: Row[] }>();

  for (const row of rows) {
    // A discrepancy's courier comes from its order when matched, or from the
    // unmatched report line itself when there's no order at all.
    const courier = row.order?.courier ?? row.reportLine?.courier ?? null;
    const key = courier?.id ?? "none";
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { courierId: courier?.id ?? null, courierName: courier?.name ?? "Sans courier", rows: [row] });
  }

  return [...groups.values()]
    .map((g) => ({
      ...g,
      subtotal: round(sum(g.rows.map((r) => r.amount))).toNumber(),
    }))
    .sort((a, b) => b.subtotal - a.subtotal);
}

export async function getTypeCounts(storeId: string, status: DiscrepancyStatus) {
  const rows = await db.discrepancy.groupBy({
    by: ["type"],
    where: { storeId, status },
    _count: true,
  });
  return Object.fromEntries(rows.map((r) => [r.type, r._count])) as Partial<
    Record<DiscrepancyType, number>
  >;
}

/** Couriers with at least one discrepancy, for the filter dropdown. */
export async function getDiscrepancyCouriers(storeId: string) {
  return db.courier.findMany({
    where: { storeId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
