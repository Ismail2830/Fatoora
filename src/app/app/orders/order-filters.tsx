"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { ORDER_TABS, type OrderTab } from "@/lib/orders-shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Filter state lives in the URL, not in React state: a filtered view is
 * something sellers bookmark, share with their confirmatrice, and link to
 * from a dashboard KPI. Local state would make all three impossible.
 */
export function OrderFilters({
  tab,
  counts,
  couriers,
  cities,
  current,
}: {
  tab: OrderTab;
  counts: Record<OrderTab, number>;
  couriers: { id: string; name: string }[];
  cities: { name: string; count: number }[];
  current: { q?: string; courier?: string; city?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(current.q ?? "");

  // Re-sync the box when the URL's q changes from somewhere else — the back
  // button, or a link from the dashboard. Adjusting state during render is
  // React's documented pattern for this; doing it in an effect would render
  // the stale value first and cost a second pass.
  const [urlQ, setUrlQ] = useState(current.q ?? "");
  if ((current.q ?? "") !== urlQ) {
    setUrlQ(current.q ?? "");
    setQ(current.q ?? "");
  }

  function push(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any filter change invalidates the page number — staying on page 4 of a
    // now-2-page result set shows an empty table.
    if (!("page" in changes)) next.delete("page");
    startTransition(() => router.push(`/app/orders?${next.toString()}`));
  }

  // Debounce so a phone number doesn't fire a query per keystroke.
  useEffect(() => {
    const current_q = params.get("q") ?? "";
    if (q === current_q) return;
    const timer = setTimeout(() => push({ q: q || undefined }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(current.courier || current.city || current.q);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ORDER_TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => push({ tab: t.id === "toutes" ? undefined : t.id })}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-[11px] text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                active
                  ? "bg-night text-white"
                  : "bg-surface border border-hair text-ink-2 hover:border-hair-strong",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "text-[11px] font-bold px-1.5 py-0.5 rounded-full",
                  active ? "bg-white/15 text-white" : "bg-black/5 text-ink-4",
                  // The unpaid tab is the money leak; make its count read as an
                  // alarm rather than a neutral statistic.
                  !active && t.id === "impayees" && counts[t.id] > 0
                    ? "bg-bad-tint text-bad-ink"
                    : "",
                )}
              >
                {counts[t.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[240px]">
          <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <span className="sr-only">Chercher</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Téléphone, tracking, n° commande ou client…"
            className="w-full h-10 pl-10 pr-4 rounded-[11px] bg-surface border border-hair text-sm placeholder:text-ink-4 outline-none focus:border-brand/40 focus:ring-3 focus:ring-brand/10"
          />
        </label>

        <select
          value={current.courier ?? ""}
          onChange={(e) => push({ courier: e.target.value || undefined })}
          className="h-10 px-3 rounded-[11px] bg-surface border border-hair text-[13.5px] outline-none focus:border-brand/40"
        >
          <option value="">Tous les couriers</option>
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={current.city ?? ""}
          onChange={(e) => push({ city: e.target.value || undefined })}
          className="h-10 px-3 rounded-[11px] bg-surface border border-hair text-[13.5px] outline-none focus:border-brand/40"
        >
          <option value="">Toutes les villes</option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              push({ q: undefined, courier: undefined, city: undefined });
            }}
          >
            <X className="size-3.5" /> Effacer
          </Button>
        )}
      </div>
    </div>
  );
}
