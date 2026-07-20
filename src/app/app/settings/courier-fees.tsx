"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMAD } from "@/lib/money";
import { deleteFeeRule, upsertFeeRule } from "./actions";

type Rule = { id: string; city: string | null; deliveredFee: number; returnFee: number; codPercent: number };
type CourierWithRules = { id: string; name: string; rules: Rule[] };

export function CourierFees({ couriers }: { couriers: CourierWithRules[] }) {
  return (
    <div className="space-y-5">
      {couriers.map((c) => (
        <div key={c.id} className="border border-hair rounded-xl overflow-hidden">
          <div className="bg-surface-muted px-4 py-2.5 font-semibold text-[14px]">{c.name}</div>
          <div className="divide-y divide-hair">
            {c.rules.map((r) => (
              <FeeRow key={r.id} courierId={c.id} rule={r} />
            ))}
            <AddCityRow courierId={c.id} existingCities={c.rules.map((r) => r.city)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FeeRow({ courierId, rule }: { courierId: string; rule: Rule }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    formData.set("courierId", courierId);
    if (rule.city) formData.set("city", rule.city);
    startTransition(async () => {
      const result = await upsertFeeRule(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteFeeRule(rule.id);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
        <span className="font-medium">{rule.city ?? "Par défaut"}</span>
        <div className="flex items-center gap-4 text-ink-3">
          <span className="font-mono tabular">{formatMAD(rule.deliveredFee)} / livraison</span>
          <span className="font-mono tabular">{formatMAD(rule.returnFee)} / retour</span>
          {rule.codPercent > 0 && <span className="font-mono tabular">{rule.codPercent}% COD</span>}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          {rule.city && (
            <Button size="icon-sm" variant="ghost" onClick={remove} aria-label="Supprimer">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="px-4 py-3 bg-surface-muted space-y-2">
      <p className="text-[13px] font-semibold">{rule.city ?? "Tarif par défaut"}</p>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Livraison" name="deliveredFee" defaultValue={rule.deliveredFee} />
        <NumberField label="Retour" name="returnFee" defaultValue={rule.returnFee} />
        <NumberField label="% du COD" name="codPercent" defaultValue={rule.codPercent} />
      </div>
      {error && <p className="text-xs text-bad-ink">{error}</p>}
      <div className="flex gap-1.5">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "…" : "Enregistrer"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function AddCityRow({
  courierId,
  existingCities,
}: {
  courierId: string;
  existingCities: (string | null)[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const city = String(formData.get("city") ?? "").trim();
    if (existingCities.includes(city)) {
      setError("Cette ville a déjà un tarif.");
      return;
    }
    formData.set("courierId", courierId);
    startTransition(async () => {
      const result = await upsertFeeRule(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-brand hover:text-brand-dark"
      >
        <Plus className="size-3.5" /> Ajouter un tarif par ville
      </button>
    );
  }

  return (
    <form action={submit} className="px-4 py-3 bg-surface-muted space-y-2">
      <Input name="city" placeholder="Ville (ex. Agadir)" required className="max-w-xs" />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Livraison" name="deliveredFee" defaultValue={0} />
        <NumberField label="Retour" name="returnFee" defaultValue={0} />
        <NumberField label="% du COD" name="codPercent" defaultValue={0} />
      </div>
      {error && <p className="text-xs text-bad-ink">{error}</p>}
      <div className="flex gap-1.5">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "…" : "Ajouter"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-ink-4 block mb-1">{label}</span>
      <Input name={name} defaultValue={defaultValue} inputMode="decimal" className="font-mono h-8" />
    </label>
  );
}
