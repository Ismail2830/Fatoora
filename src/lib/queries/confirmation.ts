import "server-only";

import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/reconciliation/normalize";

/**
 * An order is dead after this many failed attempts. Chasing a number that
 * never answers costs more than the order is worth, and a queue that never
 * empties stops being a queue.
 */
export const MAX_ATTEMPTS = 4;

/** States still in play. CONFIRMED and CANCELLED have left the queue. */
const OPEN_STATES = ["TO_CONFIRM", "NO_ANSWER", "CALLBACK"] as const;

/**
 * The next order to call, plus everything the confirmatrice needs to make the
 * call without navigating anywhere.
 *
 * Ordering is the whole design:
 *  - Only manual orders. Imported ones arrived already shipped; there is
 *    nothing to confirm and they must never enter this queue.
 *  - Callbacks that are due come first — a promise to call at 18h is the one
 *    commitment we've made to the customer.
 *  - Then oldest first. Unconfirmed COD orders decay fast; a fresh order is
 *    worth more than yesterday's, so LIFO would quietly kill the backlog.
 *  - Orders scheduled for later are hidden until they're due.
 */
export async function getNextToConfirm(storeId: string, now = new Date()) {
  const order = await db.order.findFirst({
    where: {
      storeId,
      source: "MANUAL",
      confirmationStatus: { in: [...OPEN_STATES] },
      // A parcel already with a courier has nothing left to confirm, whatever
      // its confirmation state says. Sellers do ship without confirming, and
      // the queue must not send her chasing a package that's already gone.
      shippedAt: null,
      OR: [{ nextCallAt: null }, { nextCallAt: { lte: now } }],
    },
    orderBy: [
      // Postgres sorts NULLS LAST on ASC, so due callbacks lead and plain
      // to-confirm orders follow — which is exactly the priority we want.
      { nextCallAt: "asc" },
      { orderedAt: "asc" },
    ],
    select: {
      id: true,
      reference: true,
      customerName: true,
      phone: true,
      city: true,
      address: true,
      totalAmount: true,
      notes: true,
      orderedAt: true,
      confirmationStatus: true,
      confirmationAttempts: true,
      nextCallAt: true,
      items: {
        select: { id: true, name: true, quantity: true, unitPrice: true },
      },
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          id: true,
          outcome: true,
          note: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!order) return null;

  const history = await getCustomerHistory(storeId, order.phone, order.id);

  return { order, history };
}

/**
 * What this phone number has done before.
 *
 * This is the line that stops a doomed parcel: "a refusé 3 colis sur 5" tells
 * the confirmatrice to take payment upfront or drop it, before the store eats
 * a return fee. It's also the blacklist feature, delivered at the only moment
 * it can change a decision.
 */
export async function getCustomerHistory(
  storeId: string,
  phone: string,
  excludeOrderId?: string,
) {
  const [orders, blacklisted] = await Promise.all([
    db.order.findMany({
      where: {
        storeId,
        phone,
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
      select: { id: true, status: true, confirmationStatus: true, totalAmount: true },
    }),
    db.blacklistedCustomer.findUnique({
      where: { storeId_phone: { storeId, phone } },
      select: { reason: true, refusalCount: true },
    }),
  ]);

  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const refused = orders.filter((o) => o.status === "REFUSED" || o.status === "RETURNED").length;
  // Only orders that actually reached a customer count toward the ratio;
  // a parcel still in transit hasn't proven anything yet.
  const settled = delivered + refused;

  return {
    total: orders.length,
    delivered,
    refused,
    settled,
    blacklisted,
    /** Judge only once there's enough history to mean something. */
    risky: settled >= 2 && refused / settled >= 0.5,
  };
}

/** Counts for the queue header and the sidebar badge. */
export async function getQueueCounts(storeId: string, now = new Date()) {
  const [due, scheduled, confirmedToday] = await Promise.all([
    db.order.count({
      where: {
        storeId,
        source: "MANUAL",
        confirmationStatus: { in: [...OPEN_STATES] },
        shippedAt: null,
        OR: [{ nextCallAt: null }, { nextCallAt: { lte: now } }],
      },
    }),
    db.order.count({
      where: {
        storeId,
        source: "MANUAL",
        confirmationStatus: { in: [...OPEN_STATES] },
        shippedAt: null,
        nextCallAt: { gt: now },
      },
    }),
    db.order.count({
      where: {
        storeId,
        confirmationStatus: "CONFIRMED",
        confirmedAt: { gte: startOfDay(now) },
      },
    }),
  ]);

  return { due, scheduled, confirmedToday };
}

/** Look up a phone before the call — used by manual entry and search. */
export async function findByPhone(storeId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  return getCustomerHistory(storeId, phone);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
