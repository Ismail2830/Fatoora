"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatSigned } from "@/lib/money";
import { discrepancyLabel, discrepancyTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { OrderDetailDrawer } from "@/components/app/order-detail-drawer";
import type { DiscrepancyStatus, DiscrepancyType } from "@/generated/prisma/enums";

type Row = {
  id: string;
  type: DiscrepancyType;
  amount: number;
  detail: string | null;
  createdAt: string;
  orderId: string | null;
  reference: string;
  customerName: string | null;
  city: string | null;
};

type Group = {
  courierId: string | null;
  courierName: string;
  subtotal: number;
  rows: Row[];
};

export function CourierGroups({ groups, status }: { groups: Group[]; status: DiscrepancyStatus }) {
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [focusDiscrepancyId, setFocusDiscrepancyId] = useState<string | undefined>(undefined);

  if (!groups.length) {
    return (
      <div className="bg-surface border border-hair rounded-[18px] p-12 text-center">
        <p className="text-sm text-ink-4">
          {status === "OPEN" ? "Aucun écart ouvert. Tout est à jour 🎉" : "Rien ici."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <CourierGroupCard
          key={g.courierId ?? "none"}
          group={g}
          onSelectRow={(row) => {
            if (!row.orderId) return; // unmatched lines have no order to open
            setOpenOrderId(row.orderId);
            setFocusDiscrepancyId(row.id);
          }}
        />
      ))}

      <OrderDetailDrawer
        orderId={openOrderId}
        focusDiscrepancyId={focusDiscrepancyId}
        onClose={() => {
          setOpenOrderId(null);
          setFocusDiscrepancyId(undefined);
        }}
      />
    </div>
  );
}

function CourierGroupCard({
  group,
  onSelectRow,
}: {
  group: Group;
  onSelectRow: (row: Row) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-surface border border-hair rounded-[18px] overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-muted"
      >
        <span className="flex items-center gap-2.5">
          <ChevronDown className={cn("size-4 text-ink-4 transition-transform", collapsed && "-rotate-90")} />
          <span className="font-bold text-[15px]">{group.courierName}</span>
          <span className="text-xs text-ink-4">
            {group.rows.length} ligne{group.rows.length > 1 ? "s" : ""}
          </span>
        </span>
        <span className="font-mono text-[15px] font-semibold tabular">
          {formatSigned(group.subtotal)}
        </span>
      </button>

      {!collapsed && (
        <ul className="divide-y divide-hair border-t border-hair">
          {group.rows.map((row) => (
            <li key={row.id}>
              <button
                onClick={() => onSelectRow(row)}
                disabled={!row.orderId}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Badge variant={discrepancyTone[row.type]} className="flex-none">
                  {discrepancyLabel[row.type]}
                </Badge>

                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold truncate">
                    {row.customerName ?? row.reference}
                  </span>
                  <span className="block text-xs text-ink-4 truncate">
                    {row.reference}
                    {row.city ? ` · ${row.city}` : ""}
                  </span>
                </span>

                <span className="font-mono text-[13px] font-semibold tabular flex-none">
                  {formatSigned(row.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
