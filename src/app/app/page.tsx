import Link from "next/link";

import { requireMoneyAccess } from "@/lib/session";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatAmount, formatMAD, toNumber } from "@/lib/money";
import { orderStatusLabel, orderStatusTone, discrepancyTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeekBars } from "@/components/app/week-bars";

export default async function DashboardPage() {
  // The dashboard is all money — a confirmatrice is redirected to her queue.
  const session = await requireMoneyAccess();

  const data = await getDashboardData(session.storeId);
  const firstName = session.name.split(" ")[0] || "vendeur";

  const today = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="display text-[34px] leading-tight">Salam {firstName} 👋</h1>
          <p className="text-[14.5px] text-ink-3">
            Voici l&apos;état de ton cash aujourd&apos;hui — {today}.
          </p>
        </div>
        <Button asChild size="pill">
          <Link href="/app/import">+ Importer</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
        {/* The one number the whole product exists to produce. */}
        <div className="bg-night text-white rounded-[18px] p-[22px] relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-8 -top-8 size-[150px] rounded-full"
            style={{ background: "radial-gradient(circle,rgba(139,111,240,.4),transparent 70%)" }}
          />
          <div className="relative">
            <p className="text-[13.5px] text-white/70 mb-3">Cash en transit chez les couriers</p>
            <p className="display text-[46px] leading-none mb-1 tabular">
              {formatAmount(data.cashInTransit.amount)}{" "}
              <span className="text-[22px] text-brand">MAD</span>
            </p>
            <p className="text-[13px] text-night-muted mb-[18px]">
              sur {data.cashInTransit.orderCount} commandes livrées, pas encore versées
            </p>

            <div className="flex gap-6">
              <div>
                <p className="text-xs text-night-muted">Encaissé ce mois</p>
                <p className="font-mono text-[17px] text-good mt-0.5 tabular">
                  {formatMAD(data.collectedThisMonth)}
                </p>
              </div>
              <div>
                <p className="text-xs text-night-muted">Manquant (alerte)</p>
                <p className="font-mono text-[17px] text-bad mt-0.5 tabular">
                  {formatMAD(data.missingAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[13.5px] text-ink-3">Taux de livraison</span>
          </div>
          <p className="display text-[44px] leading-none">
            {Math.round(data.deliveryRate.percent)}
            <span className="text-[22px] text-ink-4">%</span>
          </p>
          <div className="h-2 bg-brand-track rounded-full mt-3.5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${data.deliveryRate.percent}%`,
                background: "linear-gradient(90deg,#a78bfa,#7b5cf0)",
              }}
            />
          </div>
          <p className="text-[12.5px] text-ink-4 mt-2">
            {data.deliveryRate.delivered} livrées · {data.deliveryRate.failed} retours/refus
          </p>
        </Card>

        <Card className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[13.5px] text-ink-3">Alertes de paiement</span>
            {data.alertCount > 0 && <Badge variant="bad">Urgent</Badge>}
          </div>
          <p className="display text-[44px] leading-none">{data.alertCount}</p>
          <p className="text-[12.5px] text-ink-4 mt-2 mb-3">livré selon courier, pas payé</p>
          <Button asChild variant="outline" size="sm" className="w-full mt-auto">
            <Link href="/app/reconciliation">Voir les écarts →</Link>
          </Button>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-[22px]">
          <div className="flex items-start justify-between mb-1.5">
            <div>
              <p className="font-bold text-[17px]">Encaissements de la semaine</p>
              <p className="text-[13px] text-ink-3 mt-1 flex items-center gap-1.5">
                <span className="bg-night text-white font-mono text-[11.5px] font-semibold px-2 py-0.5 rounded-md">
                  {formatMAD(data.weekBars.reduce((n, b) => n + toNumber(b.amount), 0))}
                </span>
                cette semaine
              </p>
            </div>
          </div>
          <WeekBars bars={data.weekBars.map((b) => ({ day: b.day, amount: toNumber(b.amount) }))} />
        </Card>

        <Card className="p-[22px]">
          <p className="font-bold text-[17px]">Répartition par courier</p>
          <p className="text-[13px] text-ink-3 mb-4">Commandes en cours</p>

          {data.courierSplit.length === 0 ? (
            <p className="text-sm text-ink-4">Aucune commande en cours.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.courierSplit.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1.5 text-[13.5px]">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-ink-3 font-mono">{c.percent}%</span>
                  </div>
                  <div className="h-2.5 bg-brand-track rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.percent}%`, background: c.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-[22px]">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-[17px]">Commandes récentes</p>
            <Link
              href="/app/orders"
              className="text-[13px] font-semibold text-brand hover:text-brand-dark"
            >
              Tout voir →
            </Link>
          </div>

          {data.recentOrders.length === 0 ? (
            <EmptyHint>
              Importe tes commandes pour voir ton cash apparaître ici.
            </EmptyHint>
          ) : (
            <ul className="flex flex-col">
              {data.recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="grid grid-cols-[1.3fr_1fr_auto_auto] gap-3 items-center py-2.5 px-2 rounded-[10px] hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold truncate">{o.customerName}</p>
                    <p className="text-xs text-ink-4 truncate">{o.city}</p>
                  </div>
                  <p className="text-[12.5px] text-ink-3 truncate">{o.courier?.name ?? "—"}</p>
                  <p className="font-mono text-[13px] font-semibold text-right tabular">
                    {formatMAD(o.totalAmount)}
                  </p>
                  <Badge variant={orderStatusTone[o.status]} className="justify-self-end">
                    {orderStatusLabel[o.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-[22px]">
          <p className="font-bold text-[17px]">À régler aujourd&apos;hui</p>
          <p className="text-[13px] text-ink-3 mb-4">Écarts prioritaires</p>

          {data.topAlerts.length === 0 ? (
            <EmptyHint>Aucun écart. Ton cash est à jour 🎉</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.topAlerts.map((a) => (
                <Link
                  key={a.id}
                  href="/app/reconciliation"
                  className="flex items-center gap-3 bg-surface-muted border border-hair rounded-xl p-3 hover:border-hair-strong"
                >
                  <span
                    className={`size-2.5 rounded-full flex-none ${
                      discrepancyTone[a.type] === "bad" ? "bg-bad" : "bg-warn"
                    }`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">
                      {a.order?.reference ?? "Ligne courier"}
                    </span>
                    <span className="block text-xs text-ink-4 truncate">
                      {a.order?.courier?.name ?? "—"} · {a.order?.city ?? ""}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[13px] font-semibold tabular ${
                      discrepancyTone[a.type] === "bad" ? "text-bad-ink" : "text-warn-ink"
                    }`}
                  >
                    {formatMAD(a.amount)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-hair-strong p-6 text-center">
      <p className="text-sm text-ink-4">{children}</p>
    </div>
  );
}
