"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProduct, updateProduct } from "./actions";

type Existing = {
  id: string;
  name: string;
  sku: string;
  costPrice: number;
  sellPrice: number;
  active: boolean;
};

export function ProductDialog({
  mode,
  product,
}: {
  mode: "create" | "edit";
  product?: Existing;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProduct(formData)
          : await updateProduct(product!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="pill">
            <Plus className="size-4" /> Ajouter un produit
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label="Modifier">
            <Pencil className="size-3.5" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nouveau produit" : "Modifier le produit"}</DialogTitle>
          <DialogDescription>
            Le coût sert à calculer la marge réelle — jamais visible côté confirmatrice.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              name="name"
              defaultValue={product?.name}
              placeholder="Montre homme classique"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              name="sku"
              defaultValue={product?.sku}
              placeholder="MONTRE-01"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="costPrice">Coût (MAD)</Label>
              <Input
                id="costPrice"
                name="costPrice"
                defaultValue={product?.costPrice}
                inputMode="decimal"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sellPrice">Prix de vente (MAD)</Label>
              <Input
                id="sellPrice"
                name="sellPrice"
                defaultValue={product?.sellPrice}
                inputMode="decimal"
                className="font-mono"
                required
              />
            </div>
          </div>

          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={product?.active ?? true}
                className="size-4"
              />
              Produit actif
            </label>
          )}

          {error && <p className="text-[13px] text-bad-ink">{error}</p>}

          <Button type="submit" size="pill" className="w-full" disabled={pending}>
            {pending ? "Enregistrement…" : mode === "create" ? "Créer" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
