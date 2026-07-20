import type { Metadata } from "next";

import { requireSession } from "@/lib/session";
import { getNextToConfirm, getQueueCounts } from "@/lib/queries/confirmation";
import { toNumber } from "@/lib/money";
import { CallCard } from "./call-card";
import { QueueEmpty } from "./queue-empty";

export const metadata: Metadata = { title: "À confirmer — Fatora" };

// The queue changes on every action; a cached page would hand the confirmatrice
// an order she just resolved.
export const dynamic = "force-dynamic";

export default async function ConfirmationPage() {
  const session = await requireSession();

  const [next, counts] = await Promise.all([
    getNextToConfirm(session.storeId),
    getQueueCounts(session.storeId),
  ]);

  return (
    <div className="max-w-3xl mx-auto py-2">
      <header className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="display text-[34px] leading-tight">À confirmer</h1>
          <p className="text-[14.5px] text-ink-3">
            {counts.due > 0
              ? `${counts.due} commande${counts.due > 1 ? "s" : ""} en attente d'appel.`
              : "File vide — beau travail."}
          </p>
        </div>

        <div className="flex gap-5 text-right">
          <div>
            <p className="display text-2xl leading-none">{counts.confirmedToday}</p>
            <p className="text-xs text-ink-4 mt-1">confirmées aujourd&apos;hui</p>
          </div>
          {counts.scheduled > 0 && (
            <div>
              <p className="display text-2xl leading-none text-warn-ink">{counts.scheduled}</p>
              <p className="text-xs text-ink-4 mt-1">à rappeler plus tard</p>
            </div>
          )}
        </div>
      </header>

      {next ? (
        <CallCard
          // Remounts on every order so the note field and any open panel reset
          // — carrying one customer's note onto the next call would be a bug
          // with real consequences.
          key={next.order.id}
          order={{
            id: next.order.id,
            reference: next.order.reference,
            customerName: next.order.customerName,
            phone: next.order.phone,
            city: next.order.city,
            address: next.order.address,
            notes: next.order.notes,
            totalAmount: toNumber(next.order.totalAmount),
            orderedAt: next.order.orderedAt.toISOString(),
            confirmationStatus: next.order.confirmationStatus,
            confirmationAttempts: next.order.confirmationAttempts,
            nextCallAt: next.order.nextCallAt?.toISOString() ?? null,
            items: next.order.items.map((i) => ({
              id: i.id,
              name: i.name,
              quantity: i.quantity,
              unitPrice: toNumber(i.unitPrice),
            })),
            attempts: next.order.attempts.map((a) => ({
              id: a.id,
              outcome: a.outcome,
              note: a.note,
              at: a.createdAt.toISOString(),
              by: a.user?.name ?? null,
            })),
          }}
          history={next.history}
          storeName={session.storeName}
          remaining={counts.due}
        />
      ) : (
        <QueueEmpty scheduled={counts.scheduled} confirmedToday={counts.confirmedToday} />
      )}
    </div>
  );
}
