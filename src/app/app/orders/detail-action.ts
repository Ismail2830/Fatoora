"use server";

import { requireMoneyAccess } from "@/lib/session";
import { getOrderDetail } from "@/lib/queries/order-detail";
import { toNumber } from "@/lib/money";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

export type OrderDetail = {
  order: {
    id: string;
    reference: string;
    customerName: string;
    phone: string;
    city: string;
    address: string | null;
    totalAmount: number;
    amountPaid: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    trackingNumber: string | null;
    courier: { id: string; name: string } | null;
    reportLines: {
      id: string;
      statusRaw: string | null;
      statusNormalized: OrderStatus | null;
      batch: { fileName: string; createdAt: string };
    }[];
    discrepancies: {
      id: string;
      type: string;
      amount: number;
      detail: string | null;
      createdAt: string;
    }[];
    payouts: { id: string; amount: number; paidAt: string; reference: string | null }[];
  };
  history: {
    total: number;
    delivered: number;
    refused: number;
    settled: number;
    risky: boolean;
    blacklisted: { reason: string | null; refusalCount: number } | null;
  };
};

/**
 * The drawer's data, fetched via a server action rather than a query prop:
 * both Commandes and Réconciliation open it from a client-side click with
 * only an id, so the fetch has to happen after the click, not at page render.
 *
 * Decimals are converted to numbers here — that boundary is deliberate, since
 * Prisma's Decimal is not serialisable across the server/client line.
 */
export async function getOrderDetailForDrawer(orderId: string): Promise<OrderDetail | null> {
  const session = await requireMoneyAccess();
  const result = await getOrderDetail(session.storeId, orderId);
  if (!result) return null;

  const { order, history } = result;

  return {
    order: {
      id: order.id,
      reference: order.reference,
      customerName: order.customerName,
      phone: order.phone,
      city: order.city,
      address: order.address,
      totalAmount: toNumber(order.totalAmount),
      amountPaid: toNumber(order.amountPaid),
      status: order.status,
      paymentStatus: order.paymentStatus,
      trackingNumber: order.trackingNumber,
      courier: order.courier,
      reportLines: order.reportLines.map((l) => ({
        id: l.id,
        statusRaw: l.statusRaw,
        statusNormalized: l.statusNormalized,
        batch: { fileName: l.batch.fileName, createdAt: l.batch.createdAt.toISOString() },
      })),
      discrepancies: order.discrepancies.map((d) => ({
        id: d.id,
        type: d.type,
        amount: toNumber(d.amount),
        detail: d.detail,
        createdAt: d.createdAt.toISOString(),
      })),
      payouts: order.payouts.map((p) => ({
        id: p.id,
        amount: toNumber(p.amount),
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
      })),
    },
    history,
  };
}
