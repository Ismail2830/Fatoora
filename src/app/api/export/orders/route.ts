import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canSeeMoney } from "@/lib/session";
import { db } from "@/lib/db";
import { periodStart, type Period } from "@/lib/queries/analytics";
import { toNumber } from "@/lib/money";
import type { MemberRole } from "@/generated/prisma/enums";

/**
 * CSV export for the accountant — the actual reason "exportable reports"
 * matters here. A route handler, not a server action, because a file download
 * needs a real response with Content-Disposition, not a JSON return value.
 *
 * Not built on requireMoneyAccess(): that helper calls next/navigation
 * redirect(), which is meant for page renders. A route handler needs a real
 * 401/403 response instead of a redirect a browser `fetch` can't follow to
 * anywhere useful.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.storeId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (!canSeeMoney(session.user.role as MemberRole)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("period");
  const period: Period = raw === "90" ? 90 : raw === "365" ? 365 : raw === "all" ? "all" : 30;
  const since = periodStart(period);

  const orders = await db.order.findMany({
    where: { storeId: session.user.storeId, shippedAt: { not: null, ...(since ? { gte: since } : {}) } },
    orderBy: { orderedAt: "desc" },
    select: {
      reference: true,
      customerName: true,
      phone: true,
      city: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      amountPaid: true,
      courierFee: true,
      courier: { select: { name: true } },
      orderedAt: true,
      shippedAt: true,
      deliveredAt: true,
      paidAt: true,
    },
  });

  const header = [
    "Reference",
    "Client",
    "Telephone",
    "Ville",
    "Courier",
    "Statut",
    "Paiement",
    "Montant",
    "Recu",
    "Frais courier",
    "Date commande",
    "Date expedition",
    "Date livraison",
    "Date paiement",
  ];

  const rows = orders.map((o) => [
    o.reference,
    o.customerName,
    o.phone,
    o.city,
    o.courier?.name ?? "",
    o.status,
    o.paymentStatus,
    toNumber(o.totalAmount).toFixed(2),
    toNumber(o.amountPaid).toFixed(2),
    toNumber(o.courierFee).toFixed(2),
    o.orderedAt.toISOString().slice(0, 10),
    o.shippedAt?.toISOString().slice(0, 10) ?? "",
    o.deliveredAt?.toISOString().slice(0, 10) ?? "",
    o.paidAt?.toISOString().slice(0, 10) ?? "",
  ]);

  const csv = [header, ...rows]
    .map((line) => line.map(escapeCsvCell).join(","))
    .join("\r\n");

  // UTF-8 BOM so Excel on Windows reads accented city names correctly instead
  // of guessing the wrong codepage. Written as an explicit escape, not the
  // literal character, so the source file has no invisible bytes.
  const body = "\uFEFF" + csv;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fatora-commandes-${period}.csv"`,
    },
  });
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
