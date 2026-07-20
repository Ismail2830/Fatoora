import "server-only";

import { db } from "@/lib/db";
import { normalizePhone, normalizeTracking } from "@/lib/reconciliation/normalize";
import { ORDER_TABS, PAGE_SIZE, type OrderTab } from "@/lib/orders-shared";
import type { OrderWhereInput } from "@/generated/prisma/models";

/**
 * The Commandes list.
 *
 * COD work is queue-shaped, so the page leads with tabs rather than one table
 * behind a filter bar. Each tab is a saved view a dashboard KPI can link into —
 * that's what makes the dashboard's numbers provable instead of magic.
 *
 * The tab list and page size live in @/lib/orders-shared so the client-side
 * tab bar and paginator can read them without importing this module.
 */

export type OrderFilters = {
  tab: OrderTab;
  q?: string;
  courierId?: string;
  city?: string;
  page: number;
};

/** The where-clause for each tab. */
function tabWhere(tab: OrderTab): OrderWhereInput {
  switch (tab) {
    case "a_confirmer":
      // Only manual orders can be here: an imported order arrived shipped and
      // was never ours to confirm. And once a parcel is with a courier there
      // is nothing left to confirm either — this must match the confirmation
      // queue exactly, or the two screens disagree about the same question.
      return {
        source: "MANUAL",
        confirmationStatus: { in: ["TO_CONFIRM", "NO_ANSWER", "CALLBACK"] },
        shippedAt: null,
      };
    case "a_expedier":
      // Confirmed by phone but not yet handed to a courier.
      return { confirmationStatus: "CONFIRMED", shippedAt: null };
    case "en_transit":
      return { status: { in: ["IN_TRANSIT", "CONFIRMED"] }, shippedAt: { not: null } };
    case "livrees":
      return { status: "DELIVERED" };
    case "impayees":
      // The money tab — what the dashboard's "cash en transit" links into.
      return { status: "DELIVERED", paymentStatus: { in: ["PENDING", "PARTIAL"] } };
    case "retours":
      return { status: { in: ["RETURNED", "REFUSED", "LOST"] } };
    case "toutes":
    default:
      return {};
  }
}

/**
 * One search box for phone, tracking and order reference.
 *
 * The phone branch is the important one: a customer calling about their parcel
 * is the most common reason this page gets opened, and they'll read their
 * number out as "06 12...", which must match the stored 9-digit form.
 */
function searchWhere(q: string): OrderWhereInput {
  const trimmed = q.trim();
  if (!trimmed) return {};

  const or: OrderWhereInput[] = [
    { reference: { contains: trimmed, mode: "insensitive" } },
    { customerName: { contains: trimmed, mode: "insensitive" } },
  ];

  const phone = normalizePhone(trimmed);
  if (phone) or.push({ phone: { contains: phone } });

  const tracking = normalizeTracking(trimmed);
  if (tracking) or.push({ trackingNumber: { contains: trimmed, mode: "insensitive" } });

  return { OR: or };
}

/**
 * Age since the parcel was handed to a courier, falling back to the order date
 * for anything not shipped. Computed here, on the server, rather than in the
 * table component: reading the clock while rendering gives the server and the
 * browser different answers, and "9j" flickering to "8j" is how a seller stops
 * trusting the numbers.
 *
 * Only orders still moving can be late — a delivered parcel that took 12 days
 * is history, not something to chase.
 */
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function ageOf(
  order: { status: string; orderedAt: Date; shippedAt: Date | null },
  now: number,
  stuckAfterDays: number,
) {
  const from = order.shippedAt ?? order.orderedAt;
  const ageDays = Math.floor((now - from.getTime()) / 86_400_000);
  const moving = order.status === "IN_TRANSIT" || order.status === "CONFIRMED";
  const late = moving && Boolean(order.shippedAt) && ageDays >= stuckAfterDays;

  // Formatted here too: Intl output depends on the runtime's locale data, so
  // formatting during render risks the server and browser disagreeing.
  return {
    ageDays,
    late,
    dateLabel: dateFormat.format(order.orderedAt),
    dateTitle: `Commandée le ${dateTimeFormat.format(order.orderedAt)}${
      order.shippedAt ? ` · expédiée le ${dateTimeFormat.format(order.shippedAt)}` : ""
    }`,
  };
}

export async function getOrders(storeId: string, filters: OrderFilters) {
  const where: OrderWhereInput = {
    storeId,
    ...tabWhere(filters.tab),
    ...(filters.q ? searchWhere(filters.q) : {}),
    ...(filters.courierId ? { courierId: filters.courierId } : {}),
    ...(filters.city ? { city: filters.city } : {}),
  };

  const page = Math.max(1, filters.page);
  const now = Date.now();

  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { stuckAfterDays: true },
  });
  const stuckAfterDays = store?.stuckAfterDays ?? 7;

  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { orderedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        customerName: true,
        phone: true,
        city: true,
        totalAmount: true,
        amountPaid: true,
        source: true,
        status: true,
        paymentStatus: true,
        confirmationStatus: true,
        trackingNumber: true,
        orderedAt: true,
        shippedAt: true,
        courier: { select: { id: true, name: true } },
        items: { select: { name: true, quantity: true }, take: 2 },
        _count: { select: { items: true } },
      },
    }),
    // Sellers count things, so the page shows a real total rather than
    // pretending with infinite scroll.
    db.order.count({ where }),
  ]);

  return {
    rows: rows.map((o) => ({ ...o, ...ageOf(o, now, stuckAfterDays) })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Per-tab counts for the tab bar. One query per tab, run in parallel. */
export async function getTabCounts(storeId: string) {
  const entries = await Promise.all(
    ORDER_TABS.map(async (tab) => {
      const count = await db.order.count({
        where: { storeId, ...tabWhere(tab.id) },
      });
      return [tab.id, count] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<OrderTab, number>;
}

/** Options for the filter dropdowns — only what this store actually uses. */
export async function getFilterOptions(storeId: string) {
  const [couriers, cities] = await Promise.all([
    db.courier.findMany({
      where: { storeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // A store ships to a handful of cities; listing every Moroccan city would
    // make the filter useless.
    db.order.groupBy({
      by: ["city"],
      where: { storeId },
      _count: true,
      orderBy: { _count: { city: "desc" } },
      take: 30,
    }),
  ]);

  return {
    couriers,
    cities: cities.map((c) => ({ name: c.city, count: c._count })),
  };
}
