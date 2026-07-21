import "server-only";

import { db } from "@/lib/db";
import { Decimal, percentOf, round, sum } from "@/lib/money";
import { FAILED_STATUSES } from "@/lib/status";

/**
 * Parses the `?month=YYYY-MM` dashboard query param into the first-of-month
 * it names. Only "Encaissé ce mois" reads this — everything else on the
 * dashboard is live/current-state and ignores it. Falls back to the current
 * month on missing or malformed input, and clamps future months back to the
 * current one since there's nothing to report yet.
 */
export function parseMonthParam(raw: string | undefined, now: Date): Date {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const match = raw ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  if (!match) return currentMonthStart;

  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return currentMonthStart;

  const parsed = new Date(Date.UTC(Number(match[1]), monthIndex, 1));
  return parsed.getTime() > currentMonthStart.getTime() ? currentMonthStart : parsed;
}

/**
 * Every figure on the dashboard, in one round trip's worth of queries.
 *
 * Aggregation happens in Postgres, not in JS: a seller with 40k orders should
 * not ship 40k rows to the server just to add up a column.
 *
 * A selected month scopes every tile to "orders placed that month" (anchored
 * on orderedAt) — how much of June's business is still stuck with couriers,
 * June's delivery rate, June's open alerts, and so on. "Encaissé" is the one
 * exception: it's anchored on paidAt, because "cash collected in June" means
 * money that arrived in June, regardless of which month the order itself was
 * placed. For the current month, the live-state tiles (courier split of
 * orders "en cours", the rolling 7-day chart) keep their original,
 * date-unscoped behaviour — there's nothing to gain by re-deriving "right
 * now" from a month range that already contains it.
 */
export async function getDashboardData(storeId: string, now = new Date(), selectedMonth?: Date) {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStart = selectedMonth ?? currentMonthStart;
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const isCurrentMonth = monthStart.getTime() === currentMonthStart.getTime();

  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);

  const orderedInMonth = { orderedAt: { gte: monthStart, lt: monthEnd } };
  // A discrepancy without an order (an unmatched report line) has no order
  // month to anchor on, so it falls back to when the discrepancy itself was
  // raised — it still belongs to *a* month, just not one an order names.
  const discrepancyInMonth = {
    OR: [
      { order: { orderedAt: { gte: monthStart, lt: monthEnd } } },
      { orderId: null, createdAt: { gte: monthStart, lt: monthEnd } },
    ],
  };

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
      where: { storeId, status: "DELIVERED", paymentStatus: { in: ["PENDING", "PARTIAL"] }, ...orderedInMonth },
      _sum: { totalAmount: true },
      _count: true,
    }),

    db.order.aggregate({
      where: { storeId, paymentStatus: "PAID", paidAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amountPaid: true },
    }),

    db.discrepancy.groupBy({
      by: ["type"],
      where: { storeId, status: "OPEN", ...discrepancyInMonth },
      _sum: { amount: true },
      _count: true,
    }),

    db.order.count({ where: { storeId, status: "DELIVERED", ...orderedInMonth } }),
    db.order.count({ where: { storeId, status: { in: FAILED_STATUSES }, ...orderedInMonth } }),

    db.order.findMany({
      where: { storeId, ...orderedInMonth },
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
      where: { storeId, status: "OPEN", ...discrepancyInMonth },
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

    isCurrentMonth
      ? db.order.groupBy({
          by: ["courierId"],
          where: { storeId, status: { in: ["PENDING", "CONFIRMED", "IN_TRANSIT"] } },
          _count: true,
        })
      : db.order.groupBy({
          by: ["courierId"],
          where: { storeId, ...orderedInMonth },
          _count: true,
        }),

    isCurrentMonth
      ? db.order.findMany({
          where: { storeId, paymentStatus: "PAID", paidAt: { gte: weekStart } },
          select: { paidAt: true, amountPaid: true },
        })
      : db.order.findMany({
          where: { storeId, paymentStatus: "PAID", paidAt: { gte: monthStart, lt: monthEnd } },
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
    isCurrentMonth,
    monthLabel: new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(monthStart),
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
    weekBars: isCurrentMonth
      ? buildWeekBars(weekPayments, now)
      : buildMonthBars(weekPayments, monthStart, monthEnd),
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

/**
 * A past month's chart: daily bars would be ~30 thin slivers, so this buckets
 * into 7-day weeks instead, the same visual density as the live view.
 */
function buildMonthBars(
  payments: { paidAt: Date | null; amountPaid: Decimal }[],
  monthStart: Date,
  monthEnd: Date,
) {
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
  const bars: { day: string; amount: Decimal }[] = [];

  for (let offset = 0, week = 1; offset < daysInMonth; offset += 7, week++) {
    const chunkStart = new Date(monthStart);
    chunkStart.setUTCDate(chunkStart.getUTCDate() + offset);
    const chunkEnd = new Date(Math.min(chunkStart.getTime() + 7 * 86_400_000, monthEnd.getTime()));

    const amount = sum(
      payments
        .filter((p) => p.paidAt && p.paidAt >= chunkStart && p.paidAt < chunkEnd)
        .map((p) => p.amountPaid),
    );

    bars.push({ day: `Sem ${week}`, amount: round(amount) });
  }

  return bars;
}
