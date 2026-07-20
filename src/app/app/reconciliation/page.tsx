import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import {
  getDiscrepancyCouriers,
  getDiscrepancyGroups,
  getReconciliationSummary,
  getTypeCounts,
} from "@/lib/queries/reconciliation";
import { toNumber } from "@/lib/money";
import type { DiscrepancyStatus, DiscrepancyType } from "@/generated/prisma/enums";
import { SummaryStrip } from "./summary-strip";
import { ReconciliationFiltersBar } from "./filters";
import { CourierGroups } from "./courier-groups";

export const metadata: Metadata = { title: "Réconciliation — Fatora" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return x?.trim() ? x.trim() : undefined;
}

const STATUSES: DiscrepancyStatus[] = ["OPEN", "RESOLVED", "IGNORED"];

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireMoneyAccess();
  const params = await searchParams;

  const statusParam = one(params.status);
  const status: DiscrepancyStatus = STATUSES.includes(statusParam as DiscrepancyStatus)
    ? (statusParam as DiscrepancyStatus)
    : "OPEN";
  const type = one(params.type) as DiscrepancyType | undefined;
  const courierId = one(params.courier);

  const [summary, groups, typeCounts, couriers] = await Promise.all([
    getReconciliationSummary(session.storeId),
    getDiscrepancyGroups(session.storeId, { status, type, courierId }),
    getTypeCounts(session.storeId, status),
    getDiscrepancyCouriers(session.storeId),
  ]);

  return (
    <div className="space-y-5">
      <header className="mb-1">
        <h1 className="display text-[34px] leading-tight">Réconciliation</h1>
        <p className="text-[14.5px] text-ink-3">
          Ce que les couriers doivent, et ce qui mérite une vérification.
        </p>
      </header>

      <SummaryStrip
        receivableAmount={toNumber(summary.receivableAmount)}
        receivableCount={summary.receivableCount}
        toInvestigate={summary.toInvestigate}
        costsAmount={toNumber(summary.costsAmount)}
      />

      <ReconciliationFiltersBar
        status={status}
        type={type}
        courierId={courierId}
        typeCounts={typeCounts}
        totalOpen={summary.totalOpen}
        couriers={couriers}
      />

      <CourierGroups
        groups={groups.map((g) => ({
          courierId: g.courierId,
          courierName: g.courierName,
          subtotal: g.subtotal,
          rows: g.rows.map((r) => ({
            id: r.id,
            type: r.type,
            amount: toNumber(r.amount),
            detail: r.detail,
            createdAt: r.createdAt.toISOString(),
            orderId: r.order?.id ?? null,
            reference: r.order?.reference ?? r.reportLine?.trackingNumber ?? "—",
            customerName: r.order?.customerName ?? null,
            city: r.order?.city ?? null,
          })),
        }))}
        status={status}
      />
    </div>
  );
}
