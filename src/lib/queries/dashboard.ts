import "server-only";

import { db } from "@/lib/db";
import { Decimal, percentOf, round, sum } from "@/lib/money";
import { FAILED_STATUSES } from "@/lib/status";

/**
 * Every figure on the dashboard, in one round trip's worth of queries.
 *
 * Aggregation happens in Postgres, not in JS: a seller with 40k orders should
 * not ship 40k rows to the server just to add up a column.
 */
export async function getDashboardData(storeId: string, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);

  const [
    inTransit,
    collectedThisMonth,
    openDiscrepancies,
    deliveredCount,
    failedCount,
    recentOrders,
    topAlerts,
    courierSplit,
    weekPayments,
  ] = await Promise.all([
    // Cash the couriers are holding: delivered, but not yet paid out.
    db.order.aggregate({
      where: { storeId, status: "DELIVERED", paymentStatus: { in: ["PENDING", "PARTIAL"] } },
      _sum: { totalAmount: true },
      _count: true,
    }),

    db.order.aggregate({
      where: { storeId, paymentStatus: "PAID", paidAt: { gte: monthStart } },
      _sum: { amountPaid: true },
    }),

    db.discrepancy.groupBy({
      by: ["type"],
      where: { storeId, status: "OPEN" },
      _sum: { amount: true },
      _count: true,
    }),

    db.order.count({ where: { storeId, status: "DELIVERED" } }),
    db.order.count({ where: { storeId, status: { in: FAILED_STATUSES } } }),

    db.order.findMany({
      where: { storeId },
      orderBy: { orderedAt: "desc" },
      take: 5,
      select: {
        id: true,
        reference: true,
        customerName: true,
        city: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        courier: { select: { name: true } },
      },
    }),

    // The three biggest open gaps — what to chase first, by money at stake.
    db.discrepancy.findMany({
      where: { storeId, status: "OPEN" },
      orderBy: { amount: "desc" },
      take: 3,
      select: {
        id: true,
        type: true,
        amount: true,
        detail: true,
        order: { select: { reference: true, city: true, courier: { select: { name: true } } } },
      },
    }),

    db.order.groupBy({
      by: ["courierId"],
      where: { storeId, status: { in: ["PENDING", "CONFIRMED", "IN_TRANSIT"] } },
      _count: true,
    }),

    db.order.findMany({
      where: { storeId, paymentStatus: "PAID", paidAt: { gte: weekStart } },
      select: { paidAt: true, amountPaid: true },
    }),
  ]);

  const couriers = await db.courier.findMany({
    where: { storeId },
    select: { id: true, name: true },
  });
  const courierName = new Map(couriers.map((c) => [c.id, c.name]));

  const missingAmount = sum(
    openDiscrepancies
      // Only types where the courier actually owes money. A return fee is a
      // real cost but not a debt, so counting it here would inflate the alert.
      .filter((d) => ["DELIVERED_NOT_PAID", "AMOUNT_MISMATCH", "LOST"].includes(d.type))
      .map((d) => d._sum.amount ?? 0),
  );

  const alertCount = openDiscrepancies
    .filter((d) => d.type === "DELIVERED_NOT_PAID")
    .reduce((n, d) => n + d._count, 0);

  const totalFinished = deliveredCount + failedCount;

  return {
    cashInTransit: {
      amount: round(inTransit._sum.totalAmount ?? 0),
      orderCount: inTransit._count,
    },
    collectedThisMonth: round(collectedThisMonth._sum.amountPaid ?? 0),
    missingAmount: round(missingAmount),
    alertCount,
    deliveryRate: {
      // Only settled orders count: including in-transit ones would drag the
      // rate down and make it look like a collapse every time a batch ships.
      percent: percentOf(deliveredCount, totalFinished),
      delivered: deliveredCount,
      failed: failedCount,
    },
    recentOrders,
    topAlerts,
    courierSplit: buildCourierSplit(courierSplit, courierName),
    weekBars: buildWeekBars(weekPayments, now),
  };
}

function buildCourierSplit(
  rows: { courierId: string | null; _count: number }[],
  names: Map<string, string>,
) {
  const total = rows.reduce((n, r) => n + r._count, 0);
  if (!total) return [];

  const palette = ["#7b5cf0", "#3ecf8e", "#ffcf6b", "#ff8a9b", "#a78bfa"];

  return rows
    .map((r, i) => ({
      name: r.courierId ? (names.get(r.courierId) ?? "Sans courier") : "Sans courier",
      count: r._count,
      percent: Math.round((r._count / total) * 100),
      color: palette[i % palette.length],
    }))
    .sort((a, b) => b.count - a.count);
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function buildWeekBars(
  payments: { paidAt: Date | null; amountPaid: Decimal }[],
  now: Date,
) {
  const days: { day: string; amount: Decimal }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);

    const amount = sum(
      payments
        .filter((p) => p.paidAt?.toISOString().slice(0, 10) === key)
        .map((p) => p.amountPaid),
    );

    days.push({ day: DAY_LABELS[date.getUTCDay()], amount: round(amount) });
  }

  return days;
}
