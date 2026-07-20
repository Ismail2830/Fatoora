import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import {
  getAnalyticsSummary,
  getCashTrend,
  getCityBreakdown,
  getCourierDeliveryRates,
  type Period,
} from "@/lib/queries/analytics";
import { formatMAD, formatSigned } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PeriodPicker } from "./period-picker";
import { CashTrendChart } from "./cash-trend-chart";
import { CityBreakdownChart } from "./city-breakdown-chart";
import { CourierRateChart } from "./courier-rate-chart";
import { ExportButton } from "./export-button";

export const metadata: Metadata = { title: "Analytics — Fatora" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parsePeriod(raw: string | string[] | undefined): Period {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "90") return 90;
  if (v === "365") return 365;
  if (v === "all") return "all";
  return 30;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireMoneyAccess();
  const params = await searchParams;
  const period = parsePeriod(params.period);

  const [summary, trend, cities, courierRates] = await Promise.all([
    getAnalyticsSummary(session.storeId, period),
    getCashTrend(session.storeId, period),
    getCityBreakdown(session.storeId, period),
    getCourierDeliveryRates(session.storeId, period),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] leading-tight">Analytics</h1>
          <p className="text-[14.5px] text-ink-3">
            Tendances, villes et couriers — pour savoir où couper.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker period={period} />
          <ExportButton period={period} />
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Commandes expédiées" value={String(summary.ordersCount)} />
        <Stat
          label="Taux de livraison"
          value={`${Math.round(summary.deliveryRate)}%`}
          tone={summary.deliveryRate < 60 ? "bad" : "good"}
        />
        <Stat
          label="Taux de refus"
          value={`${Math.round(summary.refusalRate)}%`}
          tone={summary.refusalRate > 30 ? "bad" : undefined}
        />
        <Stat
          label="Cash manquant"
          value={formatSigned(summary.missing)}
          tone={summary.missing > 0 ? "bad" : "good"}
          mono
        />
      </div>

      <div className="bg-surface border border-hair rounded-[18px] p-5">
        <p className="font-bold text-[15px] mb-1">Encaissé vs attendu</p>
        <p className="text-[13px] text-ink-3 mb-4">
          L&apos;écart entre les deux lignes est le cash qui traîne chez les couriers.
        </p>
        <CashTrendChart data={trend} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-surface border border-hair rounded-[18px] p-5">
          <p className="font-bold text-[15px] mb-1">Taux de refus par ville</p>
          <p className="text-[13px] text-ink-3 mb-4">Les villes à surveiller, ou à éviter.</p>
          <CityBreakdownChart cities={cities} />
        </div>

        <div className="bg-surface border border-hair rounded-[18px] p-5">
          <p className="font-bold text-[15px] mb-1">Taux de livraison par courier</p>
          <p className="text-[13px] text-ink-3 mb-4">Qui livre le mieux, sur cette période.</p>
          <CourierRateChart couriers={courierRates} />
        </div>
      </div>

      <div className="bg-surface border border-hair rounded-[18px] overflow-hidden">
        <div className="p-5 pb-0">
          <p className="font-bold text-[15px]">Détail par ville</p>
        </div>
        <div className="overflow-x-auto p-5 pt-3">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[12px] text-ink-4 border-b border-hair">
                <th className="font-medium py-2 pr-3">Ville</th>
                <th className="font-medium py-2 pr-3 text-right">Commandes</th>
                <th className="font-medium py-2 pr-3 text-right">Livrées</th>
                <th className="font-medium py-2 pr-3 text-right">Refus/retours</th>
                <th className="font-medium py-2 pr-3 text-right">Taux de refus</th>
                <th className="font-medium py-2 text-right">Revenu livré</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.city} className="border-b border-hair last:border-0">
                  <td className="py-2 pr-3 font-medium">{c.city}</td>
                  <td className="py-2 pr-3 text-right tabular">{c.ordersCount}</td>
                  <td className="py-2 pr-3 text-right tabular">{c.delivered}</td>
                  <td className="py-2 pr-3 text-right tabular">{c.refused}</td>
                  <td
                    className={cn(
                      "py-2 pr-3 text-right font-mono tabular",
                      c.refusalRate >= 30 ? "text-bad-ink font-bold" : "text-ink-3",
                    )}
                  >
                    {c.refusalRate.toFixed(0)}%
                  </td>
                  <td className="py-2 text-right font-mono tabular">{formatMAD(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good";
  mono?: boolean;
}) {
  const tones = { bad: "text-bad-ink", good: "text-good-ink" };
  return (
    <div className="bg-surface border border-hair rounded-[18px] p-4">
      <p
        className={cn(
          "display text-2xl leading-none",
          mono && "font-mono tabular",
          tone && tones[tone],
        )}
      >
        {value}
      </p>
      <p className="text-xs text-ink-4 mt-1.5">{label}</p>
    </div>
  );
}
