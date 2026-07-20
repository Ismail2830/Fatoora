import "server-only";

import { db } from "@/lib/db";
import { round, sum, toNumber } from "@/lib/money";

export type Period = 30 | 90 | 365 | "all";

export function periodStart(period: Period): Date | undefined {
  if (period === "all") return undefined;
  const d = new Date();
  d.setDate(d.getDate() - period);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_MS = 86_400_000;

/**
 * Daily cash trend: what was actually collected (real payments) next to what
 * delivered that day should have paid out (net of courier fees). The gap
 * between the two lines is the missing-cash signal, read straight off Order
 * rows rather than re-bucketing Discrepancy history.
 */
export async function getCashTrend(storeId: string, period: Period) {
  const since = periodStart(period);
  const days = period === "all" ? 90 : period;

  const [payments, deliveries] = await Promise.all([
    db.order.findMany({
      where: { storeId, paidAt: since ? { gte: since } : undefined },
      select: { paidAt: true, amountPaid: true },
    }),
    db.order.findMany({
      where: { storeId, status: "DELIVERED", deliveredAt: since ? { gte: since } : undefined },
      select: { deliveredAt: true, totalAmount: true, courierFee: true },
    }),
  ]);

  const buckets: { date: string; collected: number; expected: number }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS);
    const key = day.toISOString().slice(0, 10);

    const collected = sum(
      payments.filter((p) => p.paidAt?.toISOString().slice(0, 10) === key).map((p) => p.amountPaid),
    );
    const expected = sum(
      deliveries
        .filter((d) => d.deliveredAt?.toISOString().slice(0, 10) === key)
        .map((d) => round(d.totalAmount.sub(d.courierFee))),
    );

    buckets.push({
      date: key,
      collected: toNumber(round(collected)),
      expected: toNumber(round(expected)),
    });
  }

  return buckets;
}

export type CityStat = {
  city: string;
  ordersCount: number;
  delivered: number;
  refused: number;
  refusalRate: number;
  revenue: number;
};

/** Top cities by volume — the "which regions to blacklist" screen. */
export async function getCityBreakdown(storeId: string, period: Period, limit = 10): Promise<CityStat[]> {
  const since = periodStart(period);

  const orders = await db.order.findMany({
    where: {
      storeId,
      shippedAt: { not: null, ...(since ? { gte: since } : {}) },
    },
    select: { city: true, status: true, amountPaid: true, totalAmount: true },
  });

  const byCity = new Map<string, typeof orders>();
  for (const o of orders) {
    const bucket = byCity.get(o.city);
    if (bucket) bucket.push(o);
    else byCity.set(o.city, [o]);
  }

  const rows: CityStat[] = [...byCity.entries()].map(([city, rows]) => {
    const delivered = rows.filter((r) => r.status === "DELIVERED");
    const refused = rows.filter((r) => ["RETURNED", "REFUSED", "LOST"].includes(r.status));
    const settled = delivered.length + refused.length;

    return {
      city,
      ordersCount: rows.length,
      delivered: delivered.length,
      refused: refused.length,
      refusalRate: settled > 0 ? (refused.length / settled) * 100 : 0,
      revenue: toNumber(round(sum(delivered.map((d) => d.totalAmount)))),
    };
  });

  return rows.sort((a, b) => b.ordersCount - a.ordersCount).slice(0, limit);
}

export type CourierRate = {
  courierId: string;
  name: string;
  deliveryRate: number;
  ordersCount: number;
};

export async function getCourierDeliveryRates(storeId: string, period: Period): Promise<CourierRate[]> {
  const since = periodStart(period);

  const orders = await db.order.groupBy({
    by: ["courierId", "status"],
    where: {
      storeId,
      courierId: { not: null },
      shippedAt: { not: null, ...(since ? { gte: since } : {}) },
    },
    _count: true,
  });

  const couriers = await db.courier.findMany({
    where: { storeId },
    select: { id: true, name: true },
  });

  return couriers
    .map((c) => {
      const rows = orders.filter((o) => o.courierId === c.id);
      const delivered = rows.find((r) => r.status === "DELIVERED")?._count ?? 0;
      const failed = rows
        .filter((r) => ["RETURNED", "REFUSED", "LOST"].includes(r.status))
        .reduce((n, r) => n + r._count, 0);
      const settled = delivered + failed;

      return {
        courierId: c.id,
        name: c.name,
        deliveryRate: settled > 0 ? (delivered / settled) * 100 : 0,
        ordersCount: rows.reduce((n, r) => n + r._count, 0),
      };
    })
    .filter((c) => c.ordersCount > 0)
    .sort((a, b) => b.deliveryRate - a.deliveryRate);
}

export async function getAnalyticsSummary(storeId: string, period: Period) {
  const since = periodStart(period);

  const orders = await db.order.findMany({
    where: { storeId, shippedAt: { not: null, ...(since ? { gte: since } : {}) } },
    select: { status: true, amountPaid: true, totalAmount: true, courierFee: true },
  });

  const delivered = orders.filter((o) => o.status === "DELIVERED");
  const refused = orders.filter((o) => ["RETURNED", "REFUSED", "LOST"].includes(o.status));
  const settled = delivered.length + refused.length;

  const collected = sum(delivered.map((o) => o.amountPaid));
  const expected = sum(delivered.map((o) => round(o.totalAmount.sub(o.courierFee))));

  return {
    deliveryRate: settled > 0 ? (delivered.length / settled) * 100 : 0,
    refusalRate: settled > 0 ? (refused.length / settled) * 100 : 0,
    collected: toNumber(round(collected)),
    missing: toNumber(round(expected.minus(collected))),
    ordersCount: orders.length,
  };
}
