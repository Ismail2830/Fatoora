"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { MAX_ATTEMPTS } from "@/lib/queries/confirmation";

/**
 * Outcomes of one call. Every one of these ends by advancing the queue, so the
 * confirmatrice never chooses what to work on next — the queue decides.
 */

const outcomeSchema = z.object({
  orderId: z.string().min(1),
  note: z.string().max(500).optional(),
});

const callbackSchema = outcomeSchema.extend({
  // Minutes from now. The UI offers presets rather than a datetime picker:
  // "dans 2h" is one tap, a picker is six.
  inMinutes: z.coerce.number().int().min(5).max(60 * 24 * 7),
});

const cancelSchema = outcomeSchema.extend({
  reason: z.enum([
    "TOO_EXPENSIVE",
    "CHANGED_MIND",
    "WRONG_NUMBER",
    "UNREACHABLE",
    "DUPLICATE",
    "TEST_ORDER",
    "OTHER",
  ]),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Load an order and prove it belongs to this store and is actually
 * confirmable. Every action goes through here: an order id arriving from the
 * client is untrusted input, and without the storeId check one seller could
 * confirm another's orders by guessing an id.
 */
async function loadConfirmable(orderId: string, storeId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, storeId, source: "MANUAL" },
    select: { id: true, confirmationStatus: true, confirmationAttempts: true },
  });

  if (!order) return null;

  // Already resolved — most likely a double-submit or a stale tab.
  if (order.confirmationStatus === "CONFIRMED" || order.confirmationStatus === "CANCELLED") {
    return null;
  }

  return order;
}

export async function confirmOrder(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = outcomeSchema.safeParse({
    orderId: formData.get("orderId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const order = await loadConfirmable(parsed.data.orderId, session.storeId);
  if (!order) return { ok: false, error: "Commande introuvable ou déjà traitée." };

  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: {
        confirmationStatus: "CONFIRMED",
        confirmedAt: new Date(),
        confirmationAttempts: { increment: 1 },
        // Clear the callback so a confirmed order can't resurface in the queue.
        nextCallAt: null,
        // The delivery side starts here: confirmed, not yet handed to a courier.
        status: "CONFIRMED",
      },
    }),
    db.confirmationAttempt.create({
      data: {
        orderId: order.id,
        userId: session.userId,
        outcome: "CONFIRMED",
        note: parsed.data.note,
      },
    }),
  ]);

  revalidatePath("/app/confirmation");
  return { ok: true };
}

/**
 * Nobody picked up. Retry with a widening gap, and give up after MAX_ATTEMPTS
 * rather than letting a dead number circulate forever.
 */
export async function markNoAnswer(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = outcomeSchema.safeParse({
    orderId: formData.get("orderId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const order = await loadConfirmable(parsed.data.orderId, session.storeId);
  if (!order) return { ok: false, error: "Commande introuvable ou déjà traitée." };

  const attempts = order.confirmationAttempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;

  // 2h, then 4h, then 8h — a customer who missed one call is often reachable
  // later the same day, but the odds fall off fast.
  const backoffHours = Math.min(2 ** attempts, 24);
  const nextCallAt = exhausted ? null : new Date(Date.now() + backoffHours * 3_600_000);

  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: exhausted
        ? {
            // Out of attempts: dead before shipping, which costs nothing.
            confirmationStatus: "CANCELLED",
            cancelReason: "UNREACHABLE",
            confirmationAttempts: attempts,
            nextCallAt: null,
            status: "CANCELLED",
          }
        : {
            confirmationStatus: "NO_ANSWER",
            confirmationAttempts: attempts,
            nextCallAt,
          },
    }),
    db.confirmationAttempt.create({
      data: {
        orderId: order.id,
        userId: session.userId,
        outcome: exhausted ? "CANCELLED" : "NO_ANSWER",
        note:
          parsed.data.note ??
          (exhausted ? `Injoignable après ${attempts} tentatives.` : undefined),
      },
    }),
  ]);

  revalidatePath("/app/confirmation");
  return { ok: true };
}

/** The customer answered but asked to be called back. */
export async function scheduleCallback(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = callbackSchema.safeParse({
    orderId: formData.get("orderId"),
    inMinutes: formData.get("inMinutes"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const order = await loadConfirmable(parsed.data.orderId, session.storeId);
  if (!order) return { ok: false, error: "Commande introuvable ou déjà traitée." };

  const nextCallAt = new Date(Date.now() + parsed.data.inMinutes * 60_000);

  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: {
        confirmationStatus: "CALLBACK",
        confirmationAttempts: { increment: 1 },
        nextCallAt,
      },
    }),
    db.confirmationAttempt.create({
      data: {
        orderId: order.id,
        userId: session.userId,
        outcome: "CALLBACK",
        note: parsed.data.note,
      },
    }),
  ]);

  revalidatePath("/app/confirmation");
  return { ok: true };
}

export async function cancelOrder(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = cancelSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Motif d'annulation requis." };

  const order = await loadConfirmable(parsed.data.orderId, session.storeId);
  if (!order) return { ok: false, error: "Commande introuvable ou déjà traitée." };

  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: {
        confirmationStatus: "CANCELLED",
        cancelReason: parsed.data.reason,
        confirmationAttempts: { increment: 1 },
        nextCallAt: null,
        status: "CANCELLED",
      },
    }),
    db.confirmationAttempt.create({
      data: {
        orderId: order.id,
        userId: session.userId,
        outcome: "CANCELLED",
        note: parsed.data.note,
      },
    }),
  ]);

  revalidatePath("/app/confirmation");
  return { ok: true };
}
