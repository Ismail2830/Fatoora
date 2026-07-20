import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import { getFilterOptions, getOrders, getTabCounts } from "@/lib/queries/orders";
import { isOrderTab, PAGE_SIZE, type OrderTab } from "@/lib/orders-shared";
import { toNumber } from "@/lib/money";
import { AddOrderButton } from "@/components/app/add-order-button";
import { OrderFilters } from "./order-filters";
import { OrdersTable } from "./orders-table";
import { Pagination } from "./pagination";

export const metadata: Metadata = { title: "Commandes — Fatora" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() ? v.trim() : undefined;
}

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireMoneyAccess();
  const params = await searchParams;

  const tabParam = one(params.tab);
  const tab: OrderTab = isOrderTab(tabParam) ? tabParam : "toutes";

  const filters = {
    tab,
    q: one(params.q),
    courierId: one(params.courier),
    city: one(params.city),
    page: Number(one(params.page) ?? 1) || 1,
  };

  const [{ rows, total, page, pageCount }, counts, options] = await Promise.all([
    getOrders(session.storeId, filters),
    getTabCounts(session.storeId),
    getFilterOptions(session.storeId),
  ]);

  return (
    <div className="space-y-4">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="display text-[34px] leading-tight">Commandes</h1>
          <p className="text-[14.5px] text-ink-3">
            {total.toLocaleString("fr-FR")} commande{total > 1 ? "s" : ""}
            {filters.q ? ` pour « ${filters.q} »` : ""}
          </p>
        </div>
        <AddOrderButton />
      </header>

      <OrderFilters
        tab={tab}
        counts={counts}
        couriers={options.couriers}
        cities={options.cities}
        current={{ q: filters.q, courier: filters.courierId, city: filters.city }}
      />

      <OrdersTable
        rows={rows.map((o) => ({
          id: o.id,
          reference: o.reference,
          customerName: o.customerName,
          phone: o.phone,
          city: o.city,
          totalAmount: toNumber(o.totalAmount),
          amountPaid: toNumber(o.amountPaid),
          source: o.source,
          status: o.status,
          paymentStatus: o.paymentStatus,
          confirmationStatus: o.confirmationStatus,
          trackingNumber: o.trackingNumber,
          courierName: o.courier?.name ?? null,
          // Once a parcel is in flight its courier is frozen — see CourierCell.
          shipped: Boolean(o.shippedAt),
          productLabel: productLabel(o.items, o._count.items),
          ageDays: o.ageDays,
          late: o.late,
          dateLabel: o.dateLabel,
          dateTitle: o.dateTitle,
        }))}
        couriers={options.couriers}
      />

      {total > PAGE_SIZE && (
        <Pagination page={page} pageCount={pageCount} total={total} />
      )}
    </div>
  );
}

/** "2× Montre homme" or "Montre homme +1" when the order has several lines. */
function productLabel(
  items: { name: string; quantity: number }[],
  totalItems: number,
): string {
  if (!items.length) return "—";
  const first = items[0];
  const label = first.quantity > 1 ? `${first.quantity}× ${first.name}` : first.name;
  return totalItems > 1 ? `${label} +${totalItems - 1}` : label;
}
