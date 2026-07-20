"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, TriangleAlert, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMAD } from "@/lib/money";
import { formatPhone, internationalPhone } from "@/lib/reconciliation/normalize";
import {
  CANCEL_REASONS,
  cancelReasonLabel,
  confirmationStatusLabel,
  confirmationStatusTone,
} from "@/lib/status";
import type { ConfirmationStatus } from "@/generated/prisma/enums";
import { cancelOrder, confirmOrder, markNoAnswer, scheduleCallback } from "./actions";

type Item = { id: string; name: string; quantity: number; unitPrice: number };

type Attempt = {
  id: string;
  outcome: ConfirmationStatus;
  note: string | null;
  at: string;
  by: string | null;
};

export type CallOrder = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  city: string;
  address: string | null;
  notes: string | null;
  totalAmount: number;
  orderedAt: string;
  confirmationStatus: ConfirmationStatus | null;
  confirmationAttempts: number;
  nextCallAt: string | null;
  items: Item[];
  attempts: Attempt[];
};

export type History = {
  total: number;
  delivered: number;
  refused: number;
  settled: number;
  risky: boolean;
  blacklisted: { reason: string | null; refusalCount: number } | null;
};

const CALLBACK_PRESETS = [
  { label: "Dans 1h", minutes: 60 },
  { label: "Dans 3h", minutes: 180 },
  { label: "Ce soir", minutes: 60 * 6 },
  { label: "Demain", minutes: 60 * 24 },
];

export function CallCard({
  order,
  history,
  storeName,
  remaining,
}: {
  order: CallOrder;
  history: History;
  storeName: string;
  remaining: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [panel, setPanel] = useState<"none" | "callback" | "cancel">("none");
  const [error, setError] = useState<string | null>(null);

  const intl = internationalPhone(order.phone);

  // The confirmatrice is on the phone; a message she has to compose herself is
  // a message she won't send. Pre-fill everything the customer needs to say yes.
  const waText = encodeURIComponent(
    `Salam ${order.customerName}, c'est ${storeName} 👋\n` +
      `On confirme ta commande : ${order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}\n` +
      `Total : ${formatMAD(order.totalAmount)} à ${order.city}\n` +
      `C'est bon pour toi ?`,
  );

  /**
   * Every outcome advances the queue. router.refresh() re-runs the server
   * component, which hands back the next order — so she never navigates.
   */
  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, extra?: Record<string, string>) {
    setError(null);
    const fd = new FormData();
    fd.set("orderId", order.id);
    if (note.trim()) fd.set("note", note.trim());
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      router.refresh();
    });
  }

  const waiting = daysSince(order.orderedAt);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-hair rounded-[18px] overflow-hidden">
        {/* Risk first: this must be read before the call, not after. */}
        {(history.risky || history.blacklisted) && (
          <div className="bg-bad-tint border-b border-bad/20 px-6 py-3 flex items-start gap-2.5">
            <TriangleAlert className="size-4 text-bad-ink flex-none mt-0.5" />
            <div className="text-[13px] text-bad-ink">
              <p className="font-bold">
                {history.blacklisted
                  ? "Client blacklisté"
                  : `A refusé ${history.refused} colis sur ${history.settled}`}
              </p>
              <p className="opacity-90">
                {history.blacklisted?.reason ??
                  "Demande le paiement à l'avance ou annule — un refus coûte les frais de retour."}
              </p>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-xs text-ink-4">{order.reference}</span>
                {order.confirmationStatus && order.confirmationStatus !== "TO_CONFIRM" && (
                  <Badge variant={confirmationStatusTone[order.confirmationStatus]}>
                    {confirmationStatusLabel[order.confirmationStatus]}
                  </Badge>
                )}
                {order.confirmationAttempts > 0 && (
                  <span className="text-xs text-ink-4">
                    {order.confirmationAttempts} tentative
                    {order.confirmationAttempts > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <h2 className="display text-[30px] leading-tight truncate">{order.customerName}</h2>
              <p className="text-[13px] text-ink-3">
                {order.city}
                {order.address ? ` · ${order.address}` : ""}
              </p>
            </div>

            <div className="text-right flex-none">
              <p className="display text-[30px] leading-none tabular">
                {formatMAD(order.totalAmount)}
              </p>
              <p className="text-xs text-ink-4 mt-1">
                {waiting === 0 ? "aujourd'hui" : `il y a ${waiting}j`}
              </p>
            </div>
          </div>

          {/* The phone is the point of the screen. */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <a
              href={intl ? `tel:+${intl}` : undefined}
              className="font-mono text-[26px] font-semibold tracking-tight hover:text-brand transition-colors"
            >
              {formatPhone(order.phone)}
            </a>

            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={intl ? `tel:+${intl}` : undefined}>
                  <Phone className="size-3.5" /> Appeler
                </a>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-[#25D366] text-white hover:bg-[#25D366]/90"
              >
                <a
                  href={intl ? `https://wa.me/${intl}?text=${waText}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              </Button>
            </div>
          </div>

          <ul className="rounded-xl bg-surface-muted border border-hair divide-y divide-hair mb-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">
                  <span className="font-semibold">{item.quantity}×</span> {item.name}
                </span>
                <span className="font-mono text-[13px] tabular">
                  {formatMAD(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="text-[13px] text-ink-3 bg-warn-tint border border-warn/30 rounded-lg px-3 py-2 mb-4">
              {order.notes}
            </p>
          )}

          {history.total > 0 && (
            <p className="text-xs text-ink-4 mb-4">
              Historique : {history.total} commande{history.total > 1 ? "s" : ""} ·{" "}
              {history.delivered} livrée{history.delivered > 1 ? "s" : ""} · {history.refused}{" "}
              refusée{history.refused > 1 ? "s" : ""}
            </p>
          )}

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note sur l'appel (optionnel)"
            rows={2}
            className="mb-4"
          />

          {error && (
            <p className="text-[13px] text-bad-ink bg-bad-tint rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}

          {panel === "none" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                size="pill"
                className="col-span-2 sm:col-span-1 bg-good text-white hover:bg-good/90"
                disabled={pending}
                onClick={() => run(confirmOrder)}
              >
                Confirmée
              </Button>
              <Button
                size="pill"
                variant="outline"
                disabled={pending}
                onClick={() => run(markNoAnswer)}
              >
                Pas de réponse
              </Button>
              <Button
                size="pill"
                variant="outline"
                disabled={pending}
                onClick={() => setPanel("callback")}
              >
                À rappeler
              </Button>
              <Button
                size="pill"
                variant="outline"
                className="text-bad-ink"
                disabled={pending}
                onClick={() => setPanel("cancel")}
              >
                Annulée
              </Button>
            </div>
          )}

          {panel === "callback" && (
            <div>
              <p className="text-[13px] font-semibold mb-2">Rappeler quand ?</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {CALLBACK_PRESETS.map((preset) => (
                  <Button
                    key={preset.minutes}
                    size="pill"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(scheduleCallback, { inMinutes: String(preset.minutes) })
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPanel("none")}>
                Retour
              </Button>
            </div>
          )}

          {panel === "cancel" && (
            <div>
              <p className="text-[13px] font-semibold mb-2">Pourquoi ?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {CANCEL_REASONS.map((reason) => (
                  <Button
                    key={reason}
                    size="pill"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(cancelOrder, { reason })}
                  >
                    {cancelReasonLabel[reason]}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPanel("none")}>
                Retour
              </Button>
            </div>
          )}
        </div>
      </div>

      {order.attempts.length > 0 && (
        <div className="bg-surface border border-hair rounded-[18px] p-5">
          <p className="text-[13px] font-bold mb-3">Appels précédents</p>
          <ul className="space-y-2">
            {order.attempts.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-[13px]">
                <Clock className="size-3.5 text-ink-4 mt-0.5 flex-none" />
                <span className="flex-1">
                  <span className="font-semibold">{confirmationStatusLabel[a.outcome]}</span>
                  {a.note && <span className="text-ink-3"> — {a.note}</span>}
                  <span className="block text-xs text-ink-4">
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(a.at))}
                    {a.by ? ` · ${a.by}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-ink-4">
        {remaining > 1
          ? `${remaining - 1} commande${remaining - 1 > 1 ? "s" : ""} après celle-ci`
          : "Dernière de la file"}
      </p>
    </div>
  );
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
