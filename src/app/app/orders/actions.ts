"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireMoneyAccess, requireSession } from "@/lib/session";
import { getCustomerHistory } from "@/lib/queries/confirmation";
import { canonicalCity, foldText, normalizePhone } from "@/lib/reconciliation/normalize";
import { resolveFeeRule } from "@/lib/reconciliation/fees";
import { applyPayment } from "@/lib/reconciliation/resolve";
import { round } from "@/lib/money";

/**
 * Manual order entry — the WhatsApp/DM/phone path.
 *
 * Orders created here start at zero: source MANUAL and confirmationStatus
 * TO_CONFIRM, so they land in the confirmation queue rather than pretending to
 * be in flight.
 */

const createSchema = z.object({
  customerName: z.string().min(2, "Nom du client requis."),
  phone: z.string().min(1, "Téléphone requis."),
  city: z.string().min(2, "Ville requise."),
  address: z.string().optional(),
  productId: z.string().optional(),
  productName: z.string().min(1, "Produit requis."),
  quantity: z.coerce.number().int().min(1).max(99),
  unitPrice: z.coerce.number().min(0),
  notes: z.string().max(500).optional(),
});

export type CreateOrderResult =
  | { ok: true; reference: string }
  | { ok: false; error: string };

/**
 * Next order reference for this store, from an atomic counter.
 *
 * Not MAX(reference): that's a string sort, so CMD-9999 would outrank
 * CMD-10000 and the store would start reusing references at the ten-thousandth
 * order. It would also race — two confirmatrices saving in the same instant
 * would read the same max. An atomic increment has neither problem.
 */
async function nextReference(storeId: string): Promise<string> {
  const store = await db.store.update({
    where: { id: storeId },
    data: { orderCounter: { increment: 1 } },
    select: { orderCounter: true },
  });
  return `CMD-${store.orderCounter}`;
}

export async function createManualOrder(formData: FormData): Promise<CreateOrderResult> {
  const session = await requireSession();

  const parsed = createSchema.safeParse({
    customerName: formData.get("customerName"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    address: formData.get("address") || undefined,
    productId: formData.get("productId") || undefined,
    productName: formData.get("productName"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unitPrice"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const data = parsed.data;

  const phone = normalizePhone(data.phone);
  if (!phone) return { ok: false, error: "Numéro de téléphone invalide." };

  const city = canonicalCity(data.city);
  if (!city) return { ok: false, error: "Ville invalide." };

  // Cost comes from the catalogue, never from the form: it decides the margin
  // and a confirmatrice must not be able to set it.
  let productId = data.productId ?? null;
  let unitCost = 0;

  if (productId) {
    const product = await db.product.findFirst({
      where: { id: productId, storeId: session.storeId },
      select: { costPrice: true },
    });
    if (!product) return { ok: false, error: "Produit introuvable." };
    unitCost = Number(product.costPrice);
  } else {
    // The paste box yields a product *name*, not a catalogue id. Left
    // unlinked, unitCost stays 0 and the order reports 100% margin — silently
    // poisoning the per-product profit that this app exists to get right.
    // So match the name back to the catalogue before giving up.
    const matched = await findProductByName(session.storeId, data.productName);
    if (matched) {
      productId = matched.id;
      unitCost = Number(matched.costPrice);
    }
  }

  const totalAmount = data.unitPrice * data.quantity;

  try {
    const order = await db.order.create({
      data: {
        storeId: session.storeId,
        reference: await nextReference(session.storeId),
        customerName: data.customerName.trim(),
        phone,
        city,
        address: data.address?.trim() || null,
        totalAmount,
        source: "MANUAL",
        status: "PENDING",
        paymentStatus: "PENDING",
        // The whole point of a manual order: it must be confirmed before it
        // ships, so it enters the queue.
        confirmationStatus: "TO_CONFIRM",
        orderedAt: new Date(),
        notes: data.notes?.trim() || null,
        items: {
          create: {
            productId,
            name: data.productName.trim(),
            quantity: data.quantity,
            unitPrice: data.unitPrice,
            unitCost,
          },
        },
      },
      select: { reference: true },
    });

    revalidatePath("/app/orders");
    revalidatePath("/app/confirmation");
    return { ok: true, reference: order.reference };
  } catch {
    // Almost certainly the unique [storeId, reference] index firing on a race.
    return { ok: false, error: "Impossible de créer la commande. Réessaie." };
  }
}

/**
 * Find a catalogue product from a free-text name, the way the paste box
 * produces it ("casque bluetooth" -> the Casque Bluetooth product).
 *
 * Deliberately strict: an exact folded match, or a clean containment in one
 * direction only, and never when two products could both be meant. Attaching
 * the wrong cost is worse than attaching none — a wrong margin is believed,
 * a missing one gets noticed.
 */
async function findProductByName(storeId: string, name: string) {
  const wanted = foldText(name);
  if (wanted.length < 3) return null;

  const products = await db.product.findMany({
    where: { storeId, active: true },
    select: { id: true, name: true, costPrice: true },
  });

  const exact = products.filter((p) => foldText(p.name) === wanted);
  if (exact.length === 1) return exact[0];

  const partial = products.filter((p) => {
    const folded = foldText(p.name);
    return folded.includes(wanted) || wanted.includes(folded);
  });
  return partial.length === 1 ? partial[0] : null;
}

export type CourierQuote = {
  deliveredFee: number;
  returnFee: number;
  codPercent: number;
  /** null when there's too little history to trust an average — never a guess. */
  etaDays: number | null;
  etaSampleSize: number;
};

/**
 * What assigning this courier will actually cost and how long it usually
 * takes — shown before the seller confirms, not discovered after the fact.
 *
 * ETA comes from this store's own delivered orders with this courier, never
 * a claimed SLA: a courier's stated "48h" and its actual pace are often two
 * different numbers, and only one of them is true. City-scoped first (a
 * remote city is slower), falling back to the courier's whole history when a
 * city has too few samples — and to null, not a fabricated figure, when even
 * that's too thin to mean anything.
 */
export async function getCourierQuote(courierId: string, city: string): Promise<CourierQuote | null> {
  const session = await requireSession();

  const courier = await db.courier.findFirst({
    where: { id: courierId, storeId: session.storeId },
    select: {
      feeRules: {
        select: { city: true, deliveredFee: true, returnFee: true, codPercent: true },
      },
    },
  });
  if (!courier) return null;

  const canonical = canonicalCity(city);
  const rule = resolveFeeRule(courier.feeRules, canonical);

  const MIN_SAMPLE = 3;

  const cityDeliveries = canonical
    ? await db.order.findMany({
        where: {
          storeId: session.storeId,
          courierId,
          city: canonical,
          status: "DELIVERED",
          shippedAt: { not: null },
          deliveredAt: { not: null },
        },
        select: { shippedAt: true, deliveredAt: true },
        take: 50,
      })
    : [];

  const pool =
    cityDeliveries.length >= MIN_SAMPLE
      ? cityDeliveries
      : await db.order.findMany({
          where: {
            storeId: session.storeId,
            courierId,
            status: "DELIVERED",
            shippedAt: { not: null },
            deliveredAt: { not: null },
          },
          select: { shippedAt: true, deliveredAt: true },
          take: 100,
        });

  const days = pool.map(
    (o) => (o.deliveredAt!.getTime() - o.shippedAt!.getTime()) / 86_400_000,
  );

  return {
    deliveredFee: round(rule.deliveredFee).toNumber(),
    returnFee: round(rule.returnFee).toNumber(),
    codPercent: round(rule.codPercent).toNumber(),
    etaDays:
      days.length >= MIN_SAMPLE
        ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
        : null,
    etaSampleSize: days.length,
  };
}

const assignSchema = z.object({
  orderId: z.string().min(1),
  courierId: z.string().min(1),
  trackingNumber: z.string().trim().max(60).optional(),
});

export type AssignResult = { ok: true } | { ok: false; error: string };

/**
 * Hand an order to a courier, and optionally record its tracking number.
 *
 * The tracking number is what actually ships it: until the parcel has one it
 * is still sitting with the seller, so recording it is what stamps shippedAt
 * and moves the order to En transit. That stamp then drives everything
 * downstream — the "late" flag, STUCK_IN_TRANSIT, and reconciliation's view of
 * which orders the courier should be reporting on.
 *
 * Only orders that haven't shipped can be reassigned: rewriting the courier on
 * a parcel already in flight would silently invalidate its report matching.
 */
export async function assignCourier(formData: FormData): Promise<AssignResult> {
  const session = await requireSession();

  const parsed = assignSchema.safeParse({
    orderId: formData.get("orderId"),
    courierId: formData.get("courierId"),
    trackingNumber: formData.get("trackingNumber") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const { orderId, courierId, trackingNumber } = parsed.data;

  const order = await db.order.findFirst({
    where: { id: orderId, storeId: session.storeId },
    select: { id: true, shippedAt: true },
  });
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.shippedAt) {
    return { ok: false, error: "Commande déjà expédiée — le courier ne peut plus changer." };
  }

  const courier = await db.courier.findFirst({
    where: { id: courierId, storeId: session.storeId },
    select: { id: true },
  });
  if (!courier) return { ok: false, error: "Courier introuvable." };

  await db.order.update({
    where: { id: order.id },
    data: {
      courierId,
      ...(trackingNumber
        ? {
            trackingNumber,
            shippedAt: new Date(),
            status: "IN_TRANSIT",
          }
        : {}),
    },
  });

  revalidatePath("/app/orders");
  return { ok: true };
}

/** Couriers this store ships with, for the assignment dropdown. */
export async function getCouriers() {
  const session = await requireSession();
  return db.courier.findMany({
    where: { storeId: session.storeId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------- delivery confirmation

const TERMINAL_STATUSES = ["DELIVERED", "RETURNED", "REFUSED", "LOST", "CANCELLED"];

export type ConfirmDeliveryResult = { ok: true } | { ok: false; error: string };

/**
 * "Marquer comme livré" — the manual half of paid-on-delivery.
 *
 * There's no live courier API yet, so today this is a human clicking a
 * button because a driver called or a customer confirmed on WhatsApp. It's
 * deliberately built to be replaceable later by nothing more than a second
 * caller: a driver-facing app confirming delivery would call this exact same
 * action, so nothing downstream (payment gating, the audit trail) needs to
 * change when that ships — only who's allowed to call it.
 *
 * `deliveryConfirmedById` records that this came from a human click, not a
 * courier report. It's provenance, not authority: if a courier report later
 * arrives and disagrees, the reconciliation engine still overrides status —
 * see the RETURNED/REFUSED/LOST branches in engine.ts, which now flag rather
 * than silently erase a payment recorded against this kind of manual
 * confirmation.
 */
export async function confirmDelivery(formData: FormData): Promise<ConfirmDeliveryResult> {
  const session = await requireSession();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Commande manquante." };

  const order = await db.order.findFirst({
    where: { id: orderId, storeId: session.storeId },
    select: { id: true, status: true, shippedAt: true },
  });
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (!order.shippedAt) {
    return { ok: false, error: "Assigne d'abord un courier — cette commande n'a pas encore expédié." };
  }
  if (TERMINAL_STATUSES.includes(order.status)) {
    return { ok: false, error: "Cette commande a déjà un statut final." };
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      deliveryConfirmedById: session.userId,
    },
  });

  revalidatePath("/app/orders");
  revalidatePath("/app");
  return { ok: true };
}

const recordPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().positive("Montant invalide."),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

export type RecordPaymentResult = { ok: true } | { ok: false; error: string };

/**
 * Record a payment for an order directly — the general case, not gated
 * behind an existing Discrepancy the way resolveWithPayment is. This is
 * "paid on delivery": the guard below is the entire point of building
 * confirmDelivery first, since without it there'd be nothing stopping a
 * payment from being recorded on a parcel nobody has confirmed arrived.
 *
 * Reuses the exact same applyPayment/Payout mechanics as the reconciliation
 * drawer's resolve flow — additive against whatever's already recorded, never
 * a silent overwrite — so a Payout row here and one written by an eventual
 * courier-report import are indistinguishable in the ledger.
 */
export async function recordPayment(formData: FormData): Promise<RecordPaymentResult> {
  const session = await requireMoneyAccess();
  const parsed = recordPaymentSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const order = await db.order.findFirst({
    where: { id: parsed.data.orderId, storeId: session.storeId },
    select: {
      id: true,
      status: true,
      courierId: true,
      totalAmount: true,
      courierFee: true,
      amountPaid: true,
    },
  });
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.status !== "DELIVERED") {
    return {
      ok: false,
      error: "Confirme d'abord la livraison avant d'enregistrer un paiement.",
    };
  }
  if (!order.courierId) return { ok: false, error: "Aucun courier assigné à cette commande." };

  const expected = round(order.totalAmount.sub(order.courierFee));
  const { amountPaid, paymentStatus } = applyPayment({
    expected,
    alreadyPaid: order.amountPaid,
    newAmount: parsed.data.amount,
  });

  const paidAtDate = new Date();

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { amountPaid, paymentStatus, paidAt: paidAtDate },
    });

    await tx.payout.create({
      data: {
        storeId: session.storeId,
        courierId: order.courierId!,
        orderId: order.id,
        amount: parsed.data.amount,
        paidAt: paidAtDate,
        reference: parsed.data.reference,
        note: parsed.data.note,
      },
    });

    // A bonus, not a requirement: if reconciliation already raised an alert
    // for this exact order, this payment answers it — closing it here means
    // the seller doesn't also have to go clear it by hand in Réconciliation.
    await tx.discrepancy.updateMany({
      where: {
        storeId: session.storeId,
        orderId: order.id,
        status: "OPEN",
        type: { in: ["DELIVERED_NOT_PAID", "AMOUNT_MISMATCH"] },
      },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  });

  revalidatePath("/app/orders");
  revalidatePath("/app/reconciliation");
  revalidatePath("/app");
  return { ok: true };
}

export type PhoneCheck = {
  history: { total: number; delivered: number; refused: number; settled: number; risky: boolean };
  blacklisted: { reason: string | null; refusalCount: number } | null;
  /** An order for this number in the last few days — probably the same one. */
  recentDuplicate: { reference: string; createdAt: string } | null;
};

/**
 * Look up a phone while it's being typed.
 *
 * Two answers matter before the call, not after: has this customer refused
 * parcels before, and did we already take this order? Both cost one indexed
 * query and both change what the confirmatrice does next.
 */
export async function checkPhone(rawPhone: string): Promise<PhoneCheck | null> {
  const session = await requireSession();
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const history = await getCustomerHistory(session.storeId, phone);

  const recent = await db.order.findFirst({
    where: {
      storeId: session.storeId,
      phone,
      createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { reference: true, createdAt: true },
  });

  return {
    history: {
      total: history.total,
      delivered: history.delivered,
      refused: history.refused,
      settled: history.settled,
      risky: history.risky,
    },
    blacklisted: history.blacklisted,
    recentDuplicate: recent
      ? { reference: recent.reference, createdAt: recent.createdAt.toISOString() }
      : null,
  };
}

/** Parse a pasted blob on the server so the parser stays out of the bundle. */
export async function parsePaste(text: string) {
  await requireSession();
  const { parseWhatsAppOrder } = await import("@/lib/import/parse-whatsapp");
  return parseWhatsAppOrder(text);
}

export type CatalogueProduct = {
  id: string;
  name: string;
  sku: string;
  sellPrice: number;
};

/**
 * The catalogue, for the product picker.
 *
 * sellPrice is converted to a number here: Prisma hands back a Decimal, which
 * is not serialisable across the server-action boundary. Crossing that line is
 * exactly where money should stop being a Decimal and become a plain value.
 */
export async function getProducts(): Promise<CatalogueProduct[]> {
  const session = await requireSession();
  const products = await db.product.findMany({
    where: { storeId: session.storeId, active: true },
    select: { id: true, name: true, sellPrice: true, sku: true },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    sellPrice: Number(p.sellPrice),
  }));
}
