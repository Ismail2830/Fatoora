"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert, Sparkles } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatMAD } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  checkPhone,
  createManualOrder,
  getProducts,
  parsePaste,
  type CatalogueProduct,
  type PhoneCheck,
} from "@/app/app/orders/actions";

type Draft = {
  customerName: string;
  phone: string;
  city: string;
  address: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  notes: string;
};

const EMPTY: Draft = {
  customerName: "",
  phone: "",
  city: "",
  address: "",
  productId: "",
  productName: "",
  quantity: "1",
  unitPrice: "",
  notes: "",
};

/**
 * Manual order entry, as a sheet rather than a page.
 *
 * Orders arrive by WhatsApp at random moments — often while the confirmatrice
 * is mid-queue on another call. A sheet opens over whatever she's doing and
 * closes back onto it; a page would cost her her place.
 *
 * The paste box is the feature, not the form. But nothing here auto-saves:
 * the parser is a typing-saver, and every field it fills is shown for review.
 */
export function AddOrderSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="display text-2xl">Nouvelle commande</SheetTitle>
          <SheetDescription>
            Colle le message WhatsApp — Fatora remplit ce qu&apos;il reconnaît.
          </SheetDescription>
        </SheetHeader>

        {/* Rendered only while open, so closing unmounts it and every field
            resets on its own. The next order can't inherit the last one's
            customer, and no effect is needed to make that true. */}
        {open && <OrderForm onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [guessed, setGuessed] = useState<Set<keyof Draft>>(new Set());
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [check, setCheck] = useState<PhoneCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProducts().then(setProducts);
  }, []);

  /**
   * Check the number once it's long enough to be real. Both answers change
   * what she does next, and both are worth knowing before the call: has this
   * customer refused before, and did we already take this exact order?
   *
   * Clearing runs in the phone handler rather than here, so this effect only
   * ever fires the request.
   */
  useEffect(() => {
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 9) return;

    const timer = setTimeout(() => {
      checkPhone(draft.phone).then(setCheck);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft.phone]);

  function analyse() {
    if (!paste.trim()) return;
    setError(null);
    startTransition(async () => {
      const parsed = await parsePaste(paste);
      const found = new Set<keyof Draft>();

      const next = { ...EMPTY };
      if (parsed.customerName.value) {
        next.customerName = parsed.customerName.value;
        if (parsed.customerName.confidence === "low") found.add("customerName");
      }
      if (parsed.phone.value) next.phone = parsed.phone.value;
      if (parsed.city.value) next.city = parsed.city.value;
      if (parsed.address.value) {
        next.address = parsed.address.value;
        found.add("address");
      }
      if (parsed.productName.value) {
        next.productName = parsed.productName.value;
        if (parsed.productName.confidence === "low") found.add("productName");

        // Link the parsed name to the catalogue when it clearly matches, so
        // she can see the link rather than trusting the server to find it.
        // Without a productId the order carries no cost and reports 100%
        // margin. The server re-checks this; the UI just makes it visible.
        const match = matchProduct(parsed.productName.value, products);
        if (match) {
          next.productId = match.id;
          next.productName = match.name;
          found.delete("productName");
        }
      }
      if (parsed.quantity.value) next.quantity = String(parsed.quantity.value);
      if (parsed.totalAmount.value) {
        // The parser reads the total; the form works in unit price.
        const qty = parsed.quantity.value || 1;
        next.unitPrice = String(parsed.totalAmount.value / qty);
        if (parsed.totalAmount.confidence === "low") found.add("unitPrice");
      }
      next.notes = paste.trim().slice(0, 500);

      setDraft(next);
      setGuessed(found);
    });
  }

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));

    // A part-typed number tells us nothing, so drop the previous customer's
    // verdict rather than leaving a stale blacklist warning on screen.
    if (key === "phone" && value.replace(/\D/g, "").length < 9) setCheck(null);

    // Once she's touched a field, it's hers — drop the "à vérifier" flag.
    setGuessed((g) => {
      if (!g.has(key)) return g;
      const next = new Set(g);
      next.delete(key);
      return next;
    });
  }

  function pickProduct(id: string) {
    const product = products.find((p) => p.id === id);
    setDraft((d) => ({
      ...d,
      productId: id,
      productName: product?.name ?? d.productName,
      unitPrice: product ? String(Number(product.sellPrice)) : d.unitPrice,
    }));
    setGuessed((g) => {
      const next = new Set(g);
      next.delete("productName");
      next.delete("unitPrice");
      return next;
    });
  }

  function submit() {
    setError(null);
    const fd = new FormData();
    for (const [key, value] of Object.entries(draft)) {
      if (value) fd.set(key, value);
    }

    startTransition(async () => {
      const result = await createManualOrder(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  const total = (Number(draft.unitPrice) || 0) * (Number(draft.quantity) || 0);

  return (
    <>
        <div className="px-4 pb-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="paste">Message du client</Label>
            <Textarea
              id="paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder={"Salam, bghit montre homme\nYoussef Alaoui\n0612345678\nCasablanca, Hay Mohammadi rue 5\n299 dh"}
              className="font-mono text-[13px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!paste.trim() || pending}
              onClick={analyse}
            >
              <Sparkles className="size-3.5" /> Analyser le message
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-hair" />
            <span className="text-xs text-ink-4">ou saisis à la main</span>
            <span className="h-px flex-1 bg-hair" />
          </div>

          {/* Risk and duplicates surface here, beside the phone, because this
              is the moment they can still change the decision. */}
          {check?.blacklisted && (
            <Alert tone="bad" icon>
              <strong>Client blacklisté.</strong>{" "}
              {check.blacklisted.reason ?? "Historique de refus."}
            </Alert>
          )}
          {!check?.blacklisted && check?.history.risky && (
            <Alert tone="bad" icon>
              <strong>
                A refusé {check.history.refused} colis sur {check.history.settled}.
              </strong>{" "}
              Demande le paiement à l&apos;avance ou annule.
            </Alert>
          )}
          {check?.recentDuplicate && (
            <Alert tone="warn" icon>
              <strong>Doublon possible.</strong> {check.recentDuplicate.reference} a déjà
              été créée pour ce numéro il y a moins de 3 jours.
            </Alert>
          )}
          {check && !check.blacklisted && !check.history.risky && check.history.total > 0 && (
            <Alert tone="good">
              Client connu : {check.history.total} commande
              {check.history.total > 1 ? "s" : ""}, {check.history.delivered} livrée
              {check.history.delivered > 1 ? "s" : ""}.
            </Alert>
          )}

          <Field label="Client" required guessed={guessed.has("customerName")}>
            <Input
              value={draft.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              placeholder="Youssef Alaoui"
            />
          </Field>

          <Field label="Téléphone" required>
            <Input
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="0612345678"
              inputMode="tel"
              className="font-mono"
            />
          </Field>

          <Field label="Ville" required>
            <Input
              value={draft.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Casablanca"
              list="fatora-cities"
            />
          </Field>

          <Field label="Adresse" guessed={guessed.has("address")}>
            <Input
              value={draft.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Hay Mohammadi, rue 5"
            />
          </Field>

          <Field label="Produit" required guessed={guessed.has("productName")}>
            {products.length > 0 && (
              <select
                value={draft.productId}
                onChange={(e) => pickProduct(e.target.value)}
                className="w-full h-9 px-3 mb-2 rounded-md bg-surface border border-input text-sm outline-none focus:border-brand/40"
              >
                <option value="">— Choisir dans le catalogue —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatMAD(Number(p.sellPrice))}
                  </option>
                ))}
              </select>
            )}
            <Input
              value={draft.productName}
              onChange={(e) => set("productName", e.target.value)}
              placeholder="Montre homme classique"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité" required>
              <Input
                value={draft.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                inputMode="numeric"
                className="font-mono"
              />
            </Field>
            <Field label="Prix unitaire" required guessed={guessed.has("unitPrice")}>
              <Input
                value={draft.unitPrice}
                onChange={(e) => set("unitPrice", e.target.value)}
                inputMode="decimal"
                placeholder="299"
                className="font-mono"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between bg-surface-muted border border-hair rounded-xl px-4 py-3">
            <span className="text-[13px] text-ink-3">Total COD</span>
            <span className="display text-2xl tabular">{formatMAD(total)}</span>
          </div>

          {error && <Alert tone="bad">{error}</Alert>}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="pill"
              className="flex-1"
              disabled={pending}
              onClick={onDone}
            >
              Annuler
            </Button>
            <Button size="pill" className="flex-1" disabled={pending} onClick={submit}>
              {pending ? "Création…" : "Créer la commande"}
            </Button>
          </div>

          <p className="text-xs text-ink-4 text-center">
            La commande partira dans la file « À confirmer ».
          </p>
        </div>

        <datalist id="fatora-cities">
          {["Casablanca", "Rabat", "Marrakech", "Tanger", "Fès", "Agadir", "Salé", "Meknès", "Oujda", "Kénitra"].map(
            (c) => (
              <option key={c} value={c} />
            ),
          )}
        </datalist>
    </>
  );
}

/**
 * Client-side twin of the server's catalogue lookup, kept just as strict: only
 * an unambiguous match links. Two possible products means she picks.
 */
function matchProduct(name: string, products: CatalogueProduct[]): CatalogueProduct | null {
  const wanted = name.trim().toLowerCase();
  if (wanted.length < 3) return null;

  const exact = products.filter((p) => p.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];

  const partial = products.filter((p) => {
    const candidate = p.name.toLowerCase();
    return candidate.includes(wanted) || wanted.includes(candidate);
  });
  return partial.length === 1 ? partial[0] : null;
}

function Field({
  label,
  required,
  guessed,
  children,
}: {
  label: string;
  required?: boolean;
  guessed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label>
          {label}
          {required && <span className="text-bad-ink ml-0.5">*</span>}
        </Label>
        {/* The parser guessed this one. Say so, rather than presenting a guess
            with the same authority as a hard match. */}
        {guessed && (
          <Badge variant="warn" className="text-[10px]">
            à vérifier
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}

function Alert({
  tone,
  icon,
  children,
}: {
  tone: "bad" | "warn" | "good";
  icon?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    bad: "bg-bad-tint text-bad-ink border-bad/20",
    warn: "bg-warn-tint text-warn-ink border-warn/30",
    good: "bg-good-tint text-good-ink border-good/20",
  };
  return (
    <div className={cn("flex items-start gap-2 border rounded-lg px-3 py-2 text-[13px]", tones[tone])}>
      {icon && <TriangleAlert className="size-4 flex-none mt-0.5" />}
      <span>{children}</span>
    </div>
  );
}
