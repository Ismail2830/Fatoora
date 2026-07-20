"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { Period } from "@/lib/queries/analytics";

const OPTIONS: { id: string; label: string }[] = [
  { id: "30", label: "30 jours" },
  { id: "90", label: "90 jours" },
  { id: "365", label: "1 an" },
  { id: "all", label: "Tout" },
];

export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = String(period);

  return (
    <div className="flex gap-1 bg-surface border border-hair rounded-[11px] p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => {
            const q = new URLSearchParams(params.toString());
            q.set("period", o.id);
            router.push(`/app/analytics?${q.toString()}`);
          }}
          className={cn(
            "px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors",
            current === o.id ? "bg-night text-white" : "text-ink-3 hover:bg-black/[0.04]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
