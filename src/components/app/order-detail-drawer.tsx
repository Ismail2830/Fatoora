"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMAD, formatSigned } from "@/lib/money";
import { formatPhone } from "@/lib/reconciliation/normalize";
import {
  discrepancyLabel,
  discrepancyTone,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/status";
import { getOrderDetailForDrawer, type OrderDetail } from "@/app/app/orders/detail-action";
import { confirmDelivery, recordPayment } from "@/app/app/orders/actions";
import { resolveWithPayment, acknowledgeDiscrepancy, ignoreDiscrepancy } from "@/app/app/reconciliation/actions";

const TERMINAL_NON_DELIVERED = new Set(["RETURNED", "REFUSED", "LOST", "CANCELLED"]);

/**
 * The one place a seller compares "what I shipped" against "what the courier
 * says" — shared by Commandes (click any row) and Réconciliation (click a
 * discrepancy), because both questions want the same facts: the timeline, the
 * courier's raw wording next to our interpretation, and this customer's
 * history. Building it twice would let the two drift apart.
 */
export function OrderDetailDrawer({
  orderId,
  onClose,
  /** Pre-select this discrepancy's resolve panel when opened from Réconciliation. */
  focusDiscrepancyId,
}: {
  orderId: string | null;
  onClose: () => void;
  focusDiscrepancyId?: string;
}) {
  return (
    <Sheet open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        {/* Keyed by orderId and only rendered while open: switching orders or
            closing unmounts this, so the previous order's data can't flash
            before the new fetch resolves — no effect needed to clear it. */}
        {orderId && (
          <DrawerFetcher
            key={orderId}
            orderId={orderId}
            focusDiscrepancyId={focusDiscrepancyId}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Fetches one order's detail and renders it — mounted fresh per orderId. */
function DrawerFetcher({
  orderId,
  focusDiscrepancyId,
}: {
  orderId: string;
  focusDiscrepancyId?: string;
}) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrderDetailForDrawer(orderId).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Re-fetch after a resolve/ignore action, so the header badges (statut,
  // paiement, reçu) reflect what was just written rather than what was true
  // when the drawer opened — a resolved discrepancy panel next to a stale
  // "Pas encore payé" badge would look like the action silently failed.
  function refetch() {
    getOrderDetailForDrawer(orderId).then(setDetail);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="display text-2xl">
          {detail ? detail.order.customerName : "Chargement…"}
        </SheetTitle>
        {detail && (
          <SheetDescription className="font-mono text-xs">
            {detail.order.reference}
          </SheetDescription>
        )}
      </SheetHeader>

      {detail && (
        <DrawerBody detail={detail} focusDiscrepancyId={focusDiscrepancyId} onChanged={refetch} />
      )}
    </>
  );
}

function DrawerBody({
  detail,
  focusDiscrepancyId,
  onChanged,
}: {
  detail: OrderDetail;
  focusDiscrepancyId?: string;
  onChanged: () => void;
}) {
  const { order, history } = detail;

  return (
    <div className="px-4 pb-8 space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</Badge>
        <Badge variant={paymentStatusTone[order.paymentStatus]}>
          {paymentStatusLabel[order.paymentStatus]}
        </Badge>
        {order.courier && <Badge variant="brand">{order.courier.name}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <Field label="Téléphone" value={formatPhone(order.phone)} mono />
        <Field label="Ville" value={order.city} />
        <Field label="Adresse" value={order.address ?? "—"} span2 />
        <Field label="N° de suivi" value={order.trackingNumber ?? "—"} mono />
        <Field label="Montant" value={formatMAD(order.totalAmount)} mono />
        <Field label="Reçu" value={formatMAD(order.amountPaid)} mono />
      </div>

      {/* Paid on delivery: payment only ever becomes available below once
          this order is DELIVERED — confirmed manually here, or already set by
          an imported courier report. Nothing stops a payment from being
          recorded against a parcel nobody has confirmed arrived. */}
      <DeliveryAndPayment order={order} onChanged={onChanged} />

      {history.blacklisted && (
        <Alert tone="bad">
          <strong>Client blacklisté.</strong> {history.blacklisted.reason ?? "Historique de refus."}
        </Alert>
      )}
      {!history.blacklisted && history.risky && (
        <Alert tone="bad">
          A refusé {history.refused} colis sur {history.settled} — vigilance conseillée.
        </Alert>
      )}

      {/* The debugging gift: the courier's exact wording next to what we made
          of it. When a courier changes their vocabulary, this is where it
          shows up first, instead of as a silent misread. */}
      {order.reportLines.length > 0 && (
        <section>
          <p className="text-[13px] font-bold mb-2">Rapports courier</p>
          <ul className="space-y-2">
            {order.reportLines.map((line) => (
              <li
                key={line.id}
                className="bg-surface-muted border border-hair rounded-lg px-3 py-2 text-[12.5px]"
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span className="text-ink-4">Texte brut : </span>
                    <span className="font-mono">« {line.statusRaw ?? "—"} »</span>
                  </span>
                  {line.statusNormalized ? (
                    <Badge variant={orderStatusTone[line.statusNormalized]}>
                      {orderStatusLabel[line.statusNormalized]}
                    </Badge>
                  ) : (
                    <Badge variant="warn">non reconnu</Badge>
                  )}
                </div>
                <p className="text-ink-4 mt-1">
                  {line.batch.fileName} ·{" "}
                  {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
                    new Date(line.batch.createdAt),
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.discrepancies.length > 0 && (
        <section>
          <p className="text-[13px] font-bold mb-2">Écarts ouverts</p>
          <ul className="space-y-2">
            {order.discrepancies.map((d) => (
              <DiscrepancyPanel
                key={d.id}
                discrepancy={d}
                autoOpen={d.id === focusDiscrepancyId}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </section>
      )}

      {order.payouts.length > 0 && (
        <section>
          <p className="text-[13px] font-bold mb-2">Versements enregistrés</p>
          <ul className="space-y-1.5">
            {order.payouts.map((p) => (
              <li key={p.id} className="flex justify-between text-[12.5px]">
                <span className="text-ink-4">
                  {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
                    new Date(p.paidAt),
                  )}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="font-mono tabular">{formatMAD(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.total > 0 && (
        <p className="text-xs text-ink-4">
          Historique client : {history.total} commande{history.total > 1 ? "s" : ""} ·{" "}
          {history.delivered} livrée{history.delivered > 1 ? "s" : ""} · {history.refused}{" "}
          refusée{history.refused > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Paid on delivery, made concrete: nothing below the confirm button exists
 * until the order is DELIVERED — there is no path to recordPayment for a
 * parcel still in transit. That gate is enforced again server-side (the
 * whole point would be lost if it weren't), this is just the same rule
 * reflected in what's rendered.
 */
function DeliveryAndPayment({
  order,
  onChanged,
}: {
  order: OrderDetail["order"];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function confirm() {
    setError(null);
    const fd = new FormData();
    fd.set("orderId", order.id);
    startTransition(async () => {
      const result = await confirmDelivery(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmed(true);
      router.refresh();
      onChanged();
    });
  }

  // Not shipped yet: nothing to confirm, nothing to pay.
  if (!order.shippedAt) return null;

  // A terminal outcome that isn't delivery — returned, refused, lost,
  // cancelled. No COD was ever collected, so there's nothing to record.
  if (TERMINAL_NON_DELIVERED.has(order.status) && !confirmed) return null;

  if (order.status !== "DELIVERED" && !confirmed) {
    return (
      <div className="rounded-xl border border-hair bg-surface-muted p-3.5">
        <p className="text-[13px] font-semibold mb-1">Livraison pas encore confirmée</p>
        <p className="text-xs text-ink-4 mb-3">
          Le driver a appelé, ou le client a confirmé sur WhatsApp ? Confirme ici pour
          pouvoir enregistrer le paiement.
        </p>
        {error && <p className="text-xs text-bad-ink mb-2">{error}</p>}
        <Button size="sm" disabled={pending} onClick={confirm}>
          {pending ? "…" : "Marquer comme livré"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hair bg-surface-muted p-3.5">
      <p className="text-[13px] font-semibold mb-1">
        Livré
        {order.deliveryConfirmedByName
          ? ` — confirmé manuellement par ${order.deliveryConfirmedByName}`
          : " — confirmé par rapport courier"}
      </p>
      <PaymentForm orderId={order.id} onChanged={onChanged} />
    </div>
  );
}

function PaymentForm({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function submit() {
    setError(null);
    if (!amount.trim()) {
      setError("Montant requis.");
      return;
    }
    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("amount", amount);
    if (reference.trim()) fd.set("reference", reference.trim());

    startTransition(async () => {
      const result = await recordPayment(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setReference("");
      setJustSaved(true);
      router.refresh();
      onChanged();
    });
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Montant reçu (MAD)</Label>
          <Input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setJustSaved(false);
            }}
            inputMode="decimal"
            placeholder="0"
            className="font-mono h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Référence (optionnel)</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-8"
          />
        </div>
      </div>

      {error && <p className="text-xs text-bad-ink">{error}</p>}
      {justSaved && !error && (
        <p className="text-xs text-good-ink">Versement enregistré.</p>
      )}

      <Button size="sm" disabled={pending} onClick={submit}>
        {pending ? "…" : "Enregistrer un paiement"}
      </Button>
    </div>
  );
}

const MONEY_TYPES = new Set(["DELIVERED_NOT_PAID", "AMOUNT_MISMATCH", "LOST"]);

function DiscrepancyPanel({
  discrepancy,
  autoOpen,
  onChanged,
}: {
  discrepancy: {
    id: string;
    type: string;
    amount: number;
    detail: string | null;
    createdAt: string;
  };
  autoOpen: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(autoOpen);
  const [amount, setAmount] = useState(String(Math.abs(discrepancy.amount)));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isMoney = MONEY_TYPES.has(discrepancy.type);

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const fd = new FormData();
    fd.set("discrepancyId", discrepancy.id);
    if (isMoney) {
      fd.set("amount", amount);
      fd.set("paidAt", new Date().toISOString().slice(0, 10));
      if (reference.trim()) fd.set("reference", reference.trim());
    }
    if (note.trim()) fd.set("note", note.trim());

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error ?? "Erreur.");
        return;
      }
      setDone(true);
      router.refresh();
      // Re-fetch this drawer's own data too — router.refresh() re-runs the
      // server components behind it, but the drawer holds its own client
      // state (order status, reçu) that only this refetch updates.
      onChanged();
    });
  }

  if (done) {
    return (
      <li className="bg-good-tint border border-good/20 rounded-lg px-3 py-2 text-[13px] text-good-ink">
        Traité.
      </li>
    );
  }

  return (
    <li className="border border-hair rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-muted"
      >
        <span className="flex items-center gap-2 text-left">
          <Badge variant={discrepancyTone[discrepancy.type as keyof typeof discrepancyTone]}>
            {discrepancyLabel[discrepancy.type as keyof typeof discrepancyLabel]}
          </Badge>
          <span className="text-[12.5px] text-ink-3 truncate max-w-[220px]">
            {discrepancy.detail}
          </span>
        </span>
        <span className="font-mono text-[13px] font-semibold tabular flex-none">
          {formatSigned(discrepancy.amount)}
        </span>
      </button>

      {open && (
        <div className="border-t border-hair p-3 space-y-2.5 bg-surface-muted">
          {isMoney && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Montant reçu (MAD)</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="font-mono h-8"
                />
              </div>
              <div>
                <Label className="text-xs">Référence (optionnel)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
          )}

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optionnel)"
            rows={2}
            className="text-[13px]"
          />

          {error && <p className="text-xs text-bad-ink">{error}</p>}

          <div className="flex gap-1.5">
            {isMoney ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(resolveWithPayment)}
              >
                {pending ? "…" : "Marquer payé"}
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => run(acknowledgeDiscrepancy)}>
                {pending ? "…" : "Résoudre"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(ignoreDiscrepancy)}
            >
              Ignorer
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  mono,
  span2,
}: {
  label: string;
  value: string;
  mono?: boolean;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : undefined}>
      <p className="text-ink-4 text-xs">{label}</p>
      <p className={mono ? "font-mono" : undefined}>{value}</p>
    </div>
  );
}

function Alert({ tone, children }: { tone: "bad" | "warn"; children: React.ReactNode }) {
  const tones = {
    bad: "bg-bad-tint text-bad-ink border-bad/20",
    warn: "bg-warn-tint text-warn-ink border-warn/30",
  };
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-[13px] ${tones[tone]}`}>
      <TriangleAlert className="size-4 flex-none mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
