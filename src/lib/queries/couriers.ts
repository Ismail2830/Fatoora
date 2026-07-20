import "server-only";

import { db } from "@/lib/db";
import { round } from "@/lib/money";

const RECEIVABLE_TYPES = ["DELIVERED_NOT_PAID", "AMOUNT_MISMATCH", "LOST"] as const;

export type CourierStats = {
  id: string;
  name: string;
  active: boolean;
  defaultFee: { deliveredFee: number; returnFee: number; codPercent: number } | null;
  ordersTotal: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
  pendingBalance: number;
  pendingCount: number;
  /** Average days between delivery and payment, for settled orders only. */
  avgPayoutDelayDays: number | null;
};

export async function getCourierStats(storeId: string): Promise<CourierStats[]> {
  const couriers = await db.courier.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      active: true,
      feeRules: {
        where: { city: null },
        select: { deliveredFee: true, returnFee: true, codPercent: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const [orderCounts, payoutTimings] = await Promise.all([
    db.order.groupBy({
      by: ["courierId", "status"],
      where: { storeId, courierId: { not: null } },
      _count: true,
    }),
    // Per-courier delay needs the order's courier, which groupBy on
    // Discrepancy can't reach — read the underlying orders directly.
    db.order.findMany({
      where: { storeId, courierId: { not: null }, deliveredAt: { not: null }, paidAt: { not: null } },
      select: { courierId: true, deliveredAt: true, paidAt: true },
    }),
  ]);

  // Per-courier open receivable amount — a direct query per courier is simplest
  // and correct; couriers rarely number more than a handful per store.
  const perCourierPending = await Promise.all(
    couriers.map((c) =>
      db.discrepancy.aggregate({
        where: {
          storeId,
          status: "OPEN",
          type: { in: [...RECEIVABLE_TYPES] },
          order: { courierId: c.id },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ),
  );

  return couriers.map((c, i) => {
    const counts = orderCounts.filter((o) => o.courierId === c.id);
    const ordersTotal = sum2(counts);
    const delivered = counts.find((o) => o.status === "DELIVERED")?._count ?? 0;
    const failed = counts
      .filter((o) => ["RETURNED", "REFUSED", "LOST"].includes(o.status))
      .reduce((n, o) => n + o._count, 0);

    const timings = payoutTimings.filter((o) => o.courierId === c.id);
    const delays = timings.map(
      (o) => (o.paidAt!.getTime() - o.deliveredAt!.getTime()) / 86_400_000,
    );
    const avgPayoutDelayDays =
      delays.length > 0 ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null;

    const pending = perCourierPending[i];
    const rule = c.feeRules[0];

    return {
      id: c.id,
      name: c.name,
      active: c.active,
      defaultFee: rule
        ? {
            deliveredFee: round(rule.deliveredFee).toNumber(),
            returnFee: round(rule.returnFee).toNumber(),
            codPercent: round(rule.codPercent).toNumber(),
          }
        : null,
      ordersTotal,
      delivered,
      failed,
      deliveryRate: delivered + failed > 0 ? (delivered / (delivered + failed)) * 100 : 0,
      pendingBalance: round(pending._sum.amount ?? 0).toNumber(),
      pendingCount: pending._count,
      avgPayoutDelayDays,
    };
  });
}

function sum2(rows: { _count: number }[]): number {
  return rows.reduce((n, r) => n + r._count, 0);
}

export type RecentPayout = {
  id: string;
  courierName: string;
  orderReference: string | null;
  amount: number;
  paidAt: string;
  reference: string | null;
};

export async function getRecentPayouts(storeId: string, limit = 20): Promise<RecentPayout[]> {
  const payouts = await db.payout.findMany({
    where: { storeId },
    orderBy: { paidAt: "desc" },
    take: limit,
    select: {
      id: true,
      amount: true,
      paidAt: true,
      reference: true,
      courier: { select: { name: true } },
      order: { select: { reference: true } },
    },
  });

  return payouts.map((p) => ({
    id: p.id,
    courierName: p.courier.name,
    orderReference: p.order?.reference ?? null,
    amount: round(p.amount).toNumber(),
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
  }));
}
