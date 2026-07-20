"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { OrderDetailDrawer } from "@/components/app/order-detail-drawer";
import { formatMAD } from "@/lib/money";
import { formatPhone } from "@/lib/reconciliation/normalize";
import {
  confirmationStatusLabel,
  confirmationStatusTone,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { CourierCell, type CourierOption } from "./courier-cell";
import type {
  ConfirmationStatus,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";

export type OrderRow = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  city: string;
  totalAmount: number;
  amountPaid: number;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  confirmationStatus: ConfirmationStatus | null;
  trackingNumber: string | null;
  courierName: string | null;
  shipped: boolean;
  productLabel: string;
  /**
   * Formatted on the server. Both the label and the lateness flag are computed
   * there because reading the clock or the locale during render gives the
   * server and the browser different answers — a hydration mismatch.
   */
  dateLabel: string;
  dateTitle: string;
  ageDays: number;
  late: boolean;
};

export function OrdersTable({
  rows,
  couriers,
}: {
  rows: OrderRow[];
  couriers: CourierOption[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!rows.length) {
    return (
      <div className="bg-surface border border-hair rounded-[18px] p-12 text-center">
        <p className="text-sm text-ink-4">Aucune commande ne correspond.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-hair rounded-[18px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[12px] text-ink-4 border-b border-hair">
              <Th className="pl-5">Client</Th>
              <Th>Produit</Th>
              <Th>Courier</Th>
              <Th className="text-right">Montant</Th>
              <Th>Statut</Th>
              <Th>Paiement</Th>
              <Th className="text-right pr-5">Date</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setOpenId(row.id)}
                className="border-b border-hair last:border-0 hover:bg-surface-muted cursor-pointer"
              >
                <td className="py-3 pl-5 pr-3">
                  <p className="text-[13.5px] font-semibold leading-tight">
                    {row.customerName}
                  </p>
                  <p className="text-xs text-ink-4 leading-tight mt-0.5">
                    {row.city} · <span className="font-mono">{formatPhone(row.phone)}</span>
                  </p>
                  <p className="text-[11px] text-ink-4/80 font-mono mt-0.5">{row.reference}</p>
                </td>

                <td className="py-3 pr-3">
                  <p className="text-[13px] max-w-[180px] truncate">{row.productLabel}</p>
                </td>

                {/* The courier cell edits inline; it must not also open the
                    drawer, so its clicks stop here. */}
                <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                  <CourierCell
                    orderId={row.id}
                    courierName={row.courierName}
                    trackingNumber={row.trackingNumber}
                    shipped={row.shipped}
                    couriers={couriers}
                  />
                </td>

                <td className="py-3 pr-3 text-right">
                  <p className="font-mono text-[13px] font-semibold tabular">
                    {formatMAD(row.totalAmount)}
                  </p>
                  {/* Only worth showing when it disagrees with the total. */}
                  {row.paymentStatus === "PARTIAL" && (
                    <p className="font-mono text-[11px] text-warn-ink tabular mt-0.5">
                      reçu {formatMAD(row.amountPaid)}
                    </p>
                  )}
                </td>

                <td className="py-3 pr-3">
                  <StatusCell row={row} />
                </td>

                <td className="py-3 pr-3">
                  {/* Deliberately its own column: "livrée" is the courier's
                      claim, "payée" is the bank's. The gap between them is the
                      entire product. */}
                  <Badge variant={paymentStatusTone[row.paymentStatus]}>
                    {paymentStatusLabel[row.paymentStatus]}
                  </Badge>
                </td>

                <td className="py-3 pr-5 text-right">
                  <OrderDate row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/**
 * A manual order that hasn't shipped is still in the confirmatrice's hands, so
 * its confirmation state is the honest thing to show. Once it ships, the
 * courier owns the story.
 */
function StatusCell({ row }: { row: OrderRow }) {
  const preShip =
    row.source === "MANUAL" &&
    !row.shipped &&
    row.confirmationStatus &&
    row.confirmationStatus !== "CONFIRMED";

  if (preShip) {
    return (
      <Badge variant={confirmationStatusTone[row.confirmationStatus!]}>
        {confirmationStatusLabel[row.confirmationStatus!]}
      </Badge>
    );
  }

  return <Badge variant={orderStatusTone[row.status]}>{orderStatusLabel[row.status]}</Badge>;
}

/**
 * A date makes the reader do arithmetic; "9j" in red does the job at a glance.
 * Only parcels still moving can be "late" — a delivered order that took 12
 * days is history, not a problem.
 */
function OrderDate({ row }: { row: OrderRow }) {
  return (
    <span className="inline-flex flex-col items-end" title={row.dateTitle}>
      <span
        className={cn(
          "font-mono text-[13px] tabular",
          row.late ? "text-bad-ink font-bold" : "text-ink-3",
        )}
      >
        {row.dateLabel}
      </span>
      {/* A bare date makes the reader do the arithmetic, so an overdue parcel
          still says its age — otherwise "3 juil." reads as calmly as
          "16 juil." and a month-old stuck order hides in plain sight. */}
      {row.late && (
        <span className="text-[10.5px] text-bad-ink font-semibold">
          {row.ageDays}j en transit
        </span>
      )}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("font-medium py-2.5 pr-3", className)}>{children}</th>;
}
