"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireMoneyAccess } from "@/lib/session";
import { applyPayment } from "@/lib/reconciliation/resolve";
import { round } from "@/lib/money";

/**
 * Resolving a discrepancy means different things for different types, and the
 * distinction matters:
 *
 *  - Money-bearing types (DELIVERED_NOT_PAID, AMOUNT_MISMATCH, LOST) write a
 *    real Payout row and update the order's payment fields. A lightweight
 *    "mark resolved" here would let the alert vanish while the order still
 *    says unpaid — exactly the Statut/Paiement split we protect everywhere
 *    else, broken across pages instead of columns.
 *  - Everything else (UNMATCHED_*, STUCK_IN_TRANSIT, PAID_NOT_DELIVERED,
 *    RETURN_FEE_CHARGED) has no payment to record — resolving just means
 *    "I looked into this," so it's a status flip with a note.
 *
 * Every action re-checks storeId and OPEN status server-side: a discrepancy id
 * from the client is untrusted, and a stale tab must not resolve twice.
 */

async function loadOpenDiscrepancy(id: string, storeId: string) {
  const d = await db.discrepancy.findFirst({
    where: { id, storeId, status: "OPEN" },
    select: {
      id: true,
      type: true,
      orderId: true,
      order: {
        select: {
          id: true,
          courierId: true,
          totalAmount: true,
          courierFee: true,
          amountPaid: true,
        },
      },
      reportLine: { select: { courierId: true } },
    },
  });
  return d;
}

const paymentSchema = z.object({
  discrepancyId: z.string().min(1),
  amount: z.coerce.number().positive("Montant invalide."),
  paidAt: z.string().min(1),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

export type ResolveResult = { ok: true } | { ok: false; error: string };

/**
 * Record an actual payment received for one order and resolve the discrepancy
 * it answers. Creates one Payout row — transfers here are per order, never a
 * lump sum, so every payout traces to the parcel it settles.
 */
export async function resolveWithPayment(formData: FormData): Promise<ResolveResult> {
  const session = await requireMoneyAccess();
  const parsed = paymentSchema.safeParse({
    discrepancyId: formData.get("discrepancyId"),
    amount: formData.get("amount"),
    paidAt: formData.get("paidAt"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { discrepancyId, amount, paidAt, reference, note } = parsed.data;

  const d = await loadOpenDiscrepancy(discrepancyId, session.storeId);
  if (!d) return { ok: false, error: "Écart introuvable ou déjà traité." };

  const courierId = d.order?.courierId ?? d.reportLine?.courierId ?? null;
  if (!courierId) return { ok: false, error: "Impossible de déterminer le courier." };

  const paidAtDate = new Date(paidAt);

  await db.$transaction(async (tx) => {
    if (d.type === "LOST") {
      // A lost parcel never collected COD from the customer, so this payment
      // is the courier's compensation for the goods — not the order being
      // "paid". The order's payment fields stay untouched.
      await tx.payout.create({
        data: {
          storeId: session.storeId,
          courierId,
          orderId: d.orderId,
          amount,
          paidAt: paidAtDate,
          reference,
          note: note ?? "Compensation colis perdu",
        },
      });
    } else if (d.order) {
      // DELIVERED_NOT_PAID or AMOUNT_MISMATCH: this is the seller chasing the
      // rest of what the courier owes. Expected is what reconciliation
      // computed at import time (total minus the courier's fee); the payment
      // adds to whatever was already recorded rather than replacing it, so a
      // second partial payment doesn't erase the first.
      const expected = round(d.order.totalAmount.sub(d.order.courierFee));
      const { amountPaid, paymentStatus } = applyPayment({
        expected,
        alreadyPaid: d.order.amountPaid,
        newAmount: amount,
      });

      await tx.order.update({
        where: { id: d.order.id },
        data: { amountPaid, paymentStatus, paidAt: paidAtDate },
      });

      await tx.payout.create({
        data: {
          storeId: session.storeId,
          courierId,
          orderId: d.order.id,
          amount,
          paidAt: paidAtDate,
          reference,
          note,
        },
      });
    }

    await tx.discrepancy.update({
      where: { id: d.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), note },
    });
  });

  revalidatePath("/app/reconciliation");
  revalidatePath("/app/orders");
  revalidatePath("/app");
  return { ok: true };
}

const noteSchema = z.object({
  discrepancyId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

/** For non-money types: "I looked into this," no payment to record. */
export async function acknowledgeDiscrepancy(formData: FormData): Promise<ResolveResult> {
  const session = await requireMoneyAccess();
  const parsed = noteSchema.safeParse({
    discrepancyId: formData.get("discrepancyId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const d = await loadOpenDiscrepancy(parsed.data.discrepancyId, session.storeId);
  if (!d) return { ok: false, error: "Écart introuvable ou déjà traité." };

  await db.discrepancy.update({
    where: { id: d.id },
    data: { status: "RESOLVED", resolvedAt: new Date(), note: parsed.data.note },
  });

  revalidatePath("/app/reconciliation");
  return { ok: true };
}

/** Dismiss without acting — a duplicate line, a known test order, etc. */
export async function ignoreDiscrepancy(formData: FormData): Promise<ResolveResult> {
  const session = await requireMoneyAccess();
  const parsed = noteSchema.safeParse({
    discrepancyId: formData.get("discrepancyId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const d = await loadOpenDiscrepancy(parsed.data.discrepancyId, session.storeId);
  if (!d) return { ok: false, error: "Écart introuvable ou déjà traité." };

  await db.discrepancy.update({
    where: { id: d.id },
    data: { status: "IGNORED", resolvedAt: new Date(), note: parsed.data.note },
  });

  revalidatePath("/app/reconciliation");
  return { ok: true };
}
