"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { assignCourier } from "./actions";

export type CourierOption = { id: string; name: string };

/**
 * Assigning a courier is the one write this table allows.
 *
 * Orders are imported records — letting people freely edit them would destroy
 * reconciliation's ability to say anything true. But a manual order has to be
 * handed to a courier somewhere, and doing it inline beats opening a form for
 * a two-field change.
 *
 * Once a parcel has shipped this shows plain text: rewriting the courier on
 * something already in flight would break the matching of its report lines.
 */
export function CourierCell({
  orderId,
  courierName,
  trackingNumber,
  shipped,
  couriers,
}: {
  orderId: string;
  courierName: string | null;
  trackingNumber: string | null;
  shipped: boolean;
  couriers: CourierOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [courierId, setCourierId] = useState("");
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (shipped || !couriers.length) {
    return (
      <div>
        <p className="text-[13px]">{courierName ?? "—"}</p>
        {trackingNumber && (
          <p className="text-[11px] text-ink-4 font-mono mt-0.5">{trackingNumber}</p>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setEditing(true);
          setError(null);
        }}
        className="text-left group/assign"
      >
        {courierName ? (
          <>
            <p className="text-[13px] group-hover/assign:text-brand transition-colors">
              {courierName}
            </p>
            <p className="text-[11px] text-ink-4 mt-0.5">+ n° de suivi</p>
          </>
        ) : (
          <span className="text-[13px] text-brand font-medium">+ Assigner</span>
        )}
      </button>
    );
  }

  function save() {
    if (!courierId) {
      setError("Choisis un courier.");
      return;
    }
    setError(null);

    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("courierId", courierId);
    if (tracking.trim()) fd.set("trackingNumber", tracking.trim());

    startTransition(async () => {
      const result = await assignCourier(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[190px]">
      <select
        value={courierId}
        onChange={(e) => setCourierId(e.target.value)}
        disabled={pending}
        className="h-8 px-2 rounded-md bg-surface border border-input text-[12.5px] outline-none focus:border-brand/40"
        autoFocus
      >
        <option value="">— Courier —</option>
        {couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <input
        value={tracking}
        onChange={(e) => setTracking(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={pending}
        placeholder="N° de suivi (optionnel)"
        className="h-8 px-2 rounded-md bg-surface border border-input text-[12.5px] font-mono outline-none focus:border-brand/40"
      />

      {/* Say what saving will do — this is what moves the order to En transit
          and starts the clock the whole reconciliation depends on. */}
      <p className="text-[10.5px] text-ink-4 leading-tight">
        {tracking.trim() ? "Marquera la commande expédiée." : "Sans n° de suivi : pas encore expédiée."}
      </p>

      {error && <p className="text-[11px] text-bad-ink">{error}</p>}

      <div className="flex gap-1">
        <Button size="xs" onClick={save} disabled={pending}>
          <Check className="size-3" /> {pending ? "…" : "OK"}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
