import "server-only";

import { db } from "@/lib/db";
import { getCustomerHistory } from "./confirmation";

/**
 * Everything the shared order-detail drawer shows, from one place — used by
 * both Commandes (click a row) and Réconciliation (click a discrepancy),
 * since a seller comparing "what the courier says" to "what I shipped" wants
 * the same facts regardless of which list got them there.
 */
export async function getOrderDetail(storeId: string, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, storeId },
    select: {
      id: true,
      reference: true,
      customerName: true,
      phone: true,
      city: true,
      address: true,
      totalAmount: true,
      amountPaid: true,
      courierFee: true,
      status: true,
      paymentStatus: true,
      source: true,
      trackingNumber: true,
      notes: true,
      orderedAt: true,
      shippedAt: true,
      deliveredAt: true,
      paidAt: true,
      courier: { select: { id: true, name: true } },
      deliveryConfirmedBy: { select: { name: true } },
      items: {
        select: { id: true, name: true, quantity: true, unitPrice: true, unitCost: true },
      },
      // The courier's own claim for this parcel — raw text next to our
      // interpretation, so a courier's wording change is visible, not silent.
      reportLines: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          statusRaw: true,
          statusNormalized: true,
          codAmount: true,
          paidAmount: true,
          reportDate: true,
          matchedBy: true,
          batch: { select: { fileName: true, createdAt: true } },
        },
      },
      discrepancies: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, amount: true, detail: true, status: true, createdAt: true },
      },
      payouts: {
        orderBy: { paidAt: "desc" },
        select: { id: true, amount: true, paidAt: true, reference: true, note: true },
      },
    },
  });

  if (!order) return null;

  const history = await getCustomerHistory(storeId, order.phone, order.id);

  return { order, history };
}
