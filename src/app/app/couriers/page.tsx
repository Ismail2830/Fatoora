import Link from "next/link";
import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import { getCourierStats, getRecentPayouts } from "@/lib/queries/couriers";
import { formatMAD } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Couriers — Fatora" };
export const dynamic = "force-dynamic";

export default async function CouriersPage() {
  const session = await requireMoneyAccess();
  const [couriers, payouts] = await Promise.all([
    getCourierStats(session.storeId),
    getRecentPayouts(session.storeId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-[34px] leading-tight">Couriers</h1>
        <p className="text-[14.5px] text-ink-3">
          Taux de livraison, cash en attente et délai de versement, par courier.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {couriers.map((c) => (
          <CourierCard key={c.id} courier={c} />
        ))}
      </div>

      <section className="bg-surface border border-hair rounded-[18px] p-5">
        <p className="font-bold text-[15px] mb-4">Versements récents</p>
        {payouts.length === 0 ? (
          <p className="text-sm text-ink-4">Aucun versement enregistré.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 text-[13px]">
                <span>
                  <span className="font-semibold">{p.courierName}</span>
                  {p.orderReference ? (
                    <span className="text-ink-4"> · {p.orderReference}</span>
                  ) : null}
                  {p.reference ? <span className="text-ink-4"> · {p.reference}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-ink-4">
                    {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
                      new Date(p.paidAt),
                    )}
                  </span>
                  <span className="font-mono font-semibold tabular">{formatMAD(p.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CourierCard({
  courier,
}: {
  courier: Awaited<ReturnType<typeof getCourierStats>>[number];
}) {
  return (
    <div className="bg-surface border border-hair rounded-[18px] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="font-bold text-[17px]">{courier.name}</p>
          {!courier.active && <Badge variant="secondary">Inactif</Badge>}
        </div>
        <Link
          href={`/app/reconciliation?courier=${courier.id}`}
          className="text-[13px] font-semibold text-brand hover:text-brand-dark"
        >
          Voir les écarts →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Commandes" value={String(courier.ordersTotal)} />
        <Stat
          label="Taux de livraison"
          value={`${Math.round(courier.deliveryRate)}%`}
          tone={courier.deliveryRate < 60 ? "bad" : undefined}
        />
        <Stat
          label="Délai versement"
          value={courier.avgPayoutDelayDays !== null ? `${courier.avgPayoutDelayDays}j` : "—"}
        />
      </div>

      <div className="flex items-center justify-between bg-surface-muted border border-hair rounded-xl px-4 py-3 mb-4">
        <span className="text-[13px] text-ink-3">Cash en attente</span>
        <span
          className={cn(
            "font-mono text-[15px] font-bold tabular",
            courier.pendingBalance > 0 ? "text-bad-ink" : "text-good-ink",
          )}
        >
          {formatMAD(courier.pendingBalance)}
        </span>
      </div>

      {courier.defaultFee && (
        <p className="text-xs text-ink-4">
          Frais : {formatMAD(courier.defaultFee.deliveredFee)} / livraison ·{" "}
          {formatMAD(courier.defaultFee.returnFee)} / retour
          {courier.defaultFee.codPercent > 0 ? ` · ${courier.defaultFee.codPercent}% du COD` : ""}
          {" · "}
          <Link href="/app/settings" className="text-brand hover:text-brand-dark">
            modifier
          </Link>
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div>
      <p className={cn("display text-2xl leading-none", tone === "bad" && "text-bad-ink")}>
        {value}
      </p>
      <p className="text-xs text-ink-4 mt-1">{label}</p>
    </div>
  );
}
