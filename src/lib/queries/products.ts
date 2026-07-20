import "server-only";

import { db } from "@/lib/db";
import { Decimal, money, round, sum } from "@/lib/money";

/**
 * Per-product profitability — the screen that answers "which products are
 * quietly losing money."
 *
 * Multi-line orders make this honest math impossible: a 30 MAD courier fee on
 * an order with two different products has no true split, only a convention.
 * So `monoOnly` (default true) restricts to single-product orders, where every
 * figure is a fact rather than an allocation. Toggling it off includes
 * multi-line orders with fees prorated by revenue share — clearly a different,
 * looser number, never presented with the same confidence.
 */

const SETTLED_STATUSES = ["DELIVERED", "RETURNED", "REFUSED", "LOST"] as const;
// Refusal/return/loss all mean the same thing here: cash never arrived and a
// return fee was likely charged. CANCELLED is excluded — those orders never
// shipped, so there was never a courier cost to lose.
const REFUSAL_STATUSES = ["RETURNED", "REFUSED", "LOST"] as const;

export type ProductProfitability = {
  id: string;
  sku: string;
  name: string;
  active: boolean;
  costPrice: number;
  sellPrice: number;
  nominalMarginPerUnit: number;
  ordersCount: number;
  deliveredCount: number;
  refusedCount: number;
  refusalRate: number;
  revenue: number;
  cogs: number;
  courierFees: number;
  adSpend: number;
  netProfit: number;
  /** Net profit spread across every order this product was in, delivered or not — the honest per-order economics. */
  profitPerOrder: number;
};

export async function getProductProfitability(
  storeId: string,
  monoOnly: boolean,
): Promise<ProductProfitability[]> {
  const [products, items, adSpends] = await Promise.all([
    db.product.findMany({
      where: { storeId },
      select: { id: true, sku: true, name: true, active: true, costPrice: true, sellPrice: true },
      orderBy: { name: "asc" },
    }),
    db.orderItem.findMany({
      where: { productId: { not: null }, order: { storeId } },
      select: {
        productId: true,
        quantity: true,
        unitPrice: true,
        unitCost: true,
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            courierFee: true,
            _count: { select: { items: true } },
          },
        },
      },
    }),
    db.adSpend.groupBy({
      by: ["productId"],
      where: { storeId, productId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const adSpendByProduct = new Map(
    adSpends.map((a) => [a.productId, money(a._sum.amount ?? 0)]),
  );

  const byProduct = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.productId) continue;
    if (monoOnly && item.order._count.items !== 1) continue;
    const bucket = byProduct.get(item.productId);
    if (bucket) bucket.push(item);
    else byProduct.set(item.productId, [item]);
  }

  const rows = products.map((p) => {
    const rows = byProduct.get(p.id) ?? [];

    const orderIds = new Set(rows.map((r) => r.order.id));
    const delivered = rows.filter((r) => r.order.status === "DELIVERED");
    const refused = rows.filter((r) =>
      (REFUSAL_STATUSES as readonly string[]).includes(r.order.status),
    );
    const settled = rows.filter((r) =>
      (SETTLED_STATUSES as readonly string[]).includes(r.order.status),
    );

    const revenue = sum(delivered.map((r) => money(r.unitPrice).times(r.quantity)));
    const cogs = sum(delivered.map((r) => money(r.unitCost).times(r.quantity)));

    // Fee attribution: a single-product order's whole courier fee is this
    // product's fee. A multi-product order's fee is prorated by this line's
    // share of the order's total — an estimate, which is exactly why
    // monoOnly exists as the trustworthy default.
    const feeShare = (r: (typeof rows)[number]): Decimal => {
      const orderTotal = money(r.order.totalAmount);
      if (orderTotal.isZero()) return new Decimal(0);
      const lineTotal = money(r.unitPrice).times(r.quantity);
      return money(r.order.courierFee).times(lineTotal).dividedBy(orderTotal);
    };

    const courierFees = sum([...delivered, ...refused].map(feeShare));
    const adSpend = adSpendByProduct.get(p.id) ?? new Decimal(0);

    const netProfit = round(revenue.minus(cogs).minus(courierFees).minus(adSpend));
    const refusalRate =
      delivered.length + refused.length > 0
        ? (refused.length / (delivered.length + refused.length)) * 100
        : 0;

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      active: p.active,
      costPrice: money(p.costPrice).toNumber(),
      sellPrice: money(p.sellPrice).toNumber(),
      nominalMarginPerUnit: round(money(p.sellPrice).minus(p.costPrice)).toNumber(),
      ordersCount: orderIds.size,
      deliveredCount: delivered.length,
      refusedCount: refused.length,
      refusalRate,
      revenue: round(revenue).toNumber(),
      cogs: round(cogs).toNumber(),
      courierFees: round(courierFees).toNumber(),
      adSpend: round(adSpend).toNumber(),
      netProfit: netProfit.toNumber(),
      // Spread across every settled order (delivered + refused/returned/lost):
      // this is what makes a high-refusal product's true economics visible,
      // since a failed order still cost a return fee even with zero revenue.
      profitPerOrder: settled.length > 0 ? round(netProfit.dividedBy(settled.length)).toNumber() : 0,
    };
  });

  // Worst first: this page exists to answer "what's losing money," not to
  // celebrate what's working.
  return rows.sort((a, b) => a.netProfit - b.netProfit);
}
