"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { discrepancyLabel } from "@/lib/status";
import type { DiscrepancyStatus, DiscrepancyType } from "@/generated/prisma/enums";

const STATUS_TABS: { id: DiscrepancyStatus; label: string }[] = [
  { id: "OPEN", label: "Ouverts" },
  { id: "RESOLVED", label: "Résolus" },
  { id: "IGNORED", label: "Ignorés" },
];

const ALL_TYPES = Object.keys(discrepancyLabel) as DiscrepancyType[];

export function ReconciliationFiltersBar({
  status,
  type,
  courierId,
  typeCounts,
  totalOpen,
  couriers,
}: {
  status: DiscrepancyStatus;
  type?: DiscrepancyType;
  courierId?: string;
  typeCounts: Partial<Record<DiscrepancyType, number>>;
  totalOpen: number;
  couriers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function push(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/app/reconciliation?${next.toString()}`);
  }

  const presentTypes = ALL_TYPES.filter((t) => (typeCounts[t] ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => push({ status: tab.id === "OPEN" ? undefined : tab.id, type: undefined })}
            className={cn(
              "px-3.5 py-2 rounded-[11px] text-[13.5px] font-semibold transition-colors",
              status === tab.id
                ? "bg-night text-white"
                : "bg-surface border border-hair text-ink-2 hover:border-hair-strong",
            )}
          >
            {tab.label}
            {tab.id === "OPEN" && status === "OPEN" && (
              <span className="ml-1.5 text-[11px] font-bold opacity-70">{totalOpen}</span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        <select
          value={courierId ?? ""}
          onChange={(e) => push({ courier: e.target.value || undefined })}
          className="h-9 px-3 rounded-[11px] bg-surface border border-hair text-[13px] outline-none focus:border-brand/40"
        >
          <option value="">Tous les couriers</option>
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {presentTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => push({ type: undefined })}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium",
              !type ? "bg-brand-tint text-brand-dark" : "text-ink-3 hover:bg-black/[0.04]",
            )}
          >
            Tous les types
          </button>
          {presentTypes.map((t) => (
            <button
              key={t}
              onClick={() => push({ type: t === type ? undefined : t })}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium",
                type === t ? "bg-brand-tint text-brand-dark" : "text-ink-3 hover:bg-black/[0.04]",
              )}
            >
              {discrepancyLabel[t]} <span className="opacity-60">{typeCounts[t]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
