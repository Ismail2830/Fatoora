"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStoreSettings } from "./actions";

export function StoreSettingsForm({
  store,
}: {
  store: { name: string; stuckAfterDays: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateStoreSettings(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nom de la boutique</Label>
          <Input id="name" name="name" defaultValue={store.name} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stuckAfterDays">Bloquée en transit après (jours)</Label>
          <Input
            id="stuckAfterDays"
            name="stuckAfterDays"
            type="number"
            min={1}
            max={60}
            defaultValue={store.stuckAfterDays}
            className="font-mono"
            required
          />
          <p className="text-xs text-ink-4">
            Un colis toujours en transit après ce délai déclenche une alerte.
          </p>
        </div>
      </div>

      {error && <p className="text-[13px] text-bad-ink">{error}</p>}
      {saved && !error && <p className="text-[13px] text-good-ink">Enregistré.</p>}

      <Button type="submit" size="pill" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
