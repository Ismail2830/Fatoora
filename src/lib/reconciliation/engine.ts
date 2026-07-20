import type {
  DiscrepancyType,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { Decimal, equalWithin, money, round } from "@/lib/money";
import { computeFees, type FeeRule } from "./fees";
import { matchReportLines, type MatchStrategy } from "./match";

export type EngineOrder = {
  id: string;
  reference: string;
  phone: string;
  city: string;
  trackingNumber?: string | null;
  courierId?: string | null;
  totalAmount: Decimal | number | string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippedAt?: Date | null;
  orderedAt: Date;
};

export type EngineLine = {
  id: string;
  courierId?: string | null;
  trackingNumber?: string | null;
  phone?: string | null;
  reference?: string | null;
  statusNormalized?: OrderStatus | null;
  codAmount?: Decimal | number | string | null;
  paidAmount?: Decimal | number | string | null;
  reportDate?: Date | null;
};

export type OrderUpdate = {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amountPaid: Decimal;
  courierFee: Decimal;
  deliveredAt?: Date | null;
  paidAt?: Date | null;
};

export type LineMatch = {
  lineId: string;
  orderId: string;
  matchedBy: MatchStrategy;
};

export type DiscrepancyDraft = {
  type: DiscrepancyType;
  orderId?: string;
  reportLineId?: string;
  amount: Decimal;
  detail: string;
};

export type ReconcileInput = {
  orders: EngineOrder[];
  lines: EngineLine[];
  /** Fee rules keyed by courier id. */
  feeRules: Record<string, FeeRule[]>;
  /** In-transit longer than this many days counts as stuck. */
  stuckAfterDays: number;
  /** Injected so runs are deterministic and testable. */
  now: Date;
  /** Tolerance in MAD when comparing expected vs actual payout. */
  amountTolerance?: number;
};

export type ReconcileResult = {
  matches: LineMatch[];
  orderUpdates: OrderUpdate[];
  discrepancies: DiscrepancyDraft[];
  stats: {
    linesTotal: number;
    linesMatched: number;
    linesUnmatched: number;
    linesAmbiguous: number;
    ordersTouched: number;
    /** Total MAD the courier owes but hasn't paid. */
    missingAmount: Decimal;
  };
};

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * The heart of Fatora.
 *
 * Compares what the couriers claim against what the seller shipped and what
 * actually landed in the bank, then reports every gap in MAD. Pure: no DB, no
 * clock, no I/O — the caller supplies `now` and persists the result. That keeps
 * the money rules testable, which is the only reason to trust the number on the
 * dashboard.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const { orders, lines, feeRules, stuckAfterDays, now } = input;
  const tolerance = input.amountTolerance ?? 1;

  const { matches, unmatchedLines, unmatchedOrders, ambiguousLines } = matchReportLines(
    lines,
    orders,
  );

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const orderUpdates: OrderUpdate[] = [];
  const discrepancies: DiscrepancyDraft[] = [];
  let missingAmount = new Decimal(0);

  for (const match of matches) {
    const order = orderById.get(match.orderId);
    const line = lineById.get(match.lineId);
    if (!order || !line) continue;

    // The courier's report is the authority on where the parcel ended up; the
    // seller's own status is just what they last knew.
    const status = line.statusNormalized ?? order.status;
    const rules = feeRules[order.courierId ?? ""] ?? [];
    const fees = computeFees(
      { status, totalAmount: order.totalAmount, city: order.city },
      rules,
    );

    const reportedPaid = line.paidAmount === null || line.paidAmount === undefined
      ? null
      : money(line.paidAmount);
    const paid = reportedPaid ?? new Decimal(0);

    let paymentStatus: PaymentStatus;
    let paidAt: Date | null = null;

    if (status === "DELIVERED") {
      if (reportedPaid === null || paid.isZero()) {
        // The product's whole reason to exist: courier says delivered, no cash.
        paymentStatus = "PENDING";
        discrepancies.push({
          type: "DELIVERED_NOT_PAID",
          orderId: order.id,
          reportLineId: line.id,
          amount: fees.expectedPayout,
          detail: `${order.reference} — livré le ${formatDay(line.reportDate ?? now)}, aucun versement reçu.`,
        });
        missingAmount = missingAmount.plus(fees.expectedPayout);
      } else if (equalWithin(paid, fees.expectedPayout, tolerance)) {
        paymentStatus = "PAID";
        paidAt = line.reportDate ?? now;
      } else {
        // Paid, but not the right amount. The gap is what's still owed
        // (negative means the courier overpaid).
        const gap = round(fees.expectedPayout.minus(paid));
        paymentStatus = paid.lessThan(fees.expectedPayout) ? "PARTIAL" : "PAID";
        paidAt = line.reportDate ?? now;
        discrepancies.push({
          type: "AMOUNT_MISMATCH",
          orderId: order.id,
          reportLineId: line.id,
          amount: gap,
          detail:
            `${order.reference} — attendu ${fees.expectedPayout.toFixed(2)} MAD ` +
            `après frais, reçu ${paid.toFixed(2)} MAD.`,
        });
        if (gap.isPositive()) missingAmount = missingAmount.plus(gap);
      }
    } else if (status === "RETURNED" || status === "REFUSED") {
      paymentStatus = "NOT_APPLICABLE";
      if (fees.returnFee.isPositive()) {
        discrepancies.push({
          type: "RETURN_FEE_CHARGED",
          orderId: order.id,
          reportLineId: line.id,
          amount: fees.returnFee,
          detail: `${order.reference} — ${statusWord(status)} à ${order.city}, frais de retour ${fees.returnFee.toFixed(2)} MAD.`,
        });
      }
    } else if (status === "LOST") {
      paymentStatus = "NOT_APPLICABLE";
      discrepancies.push({
        type: "LOST",
        orderId: order.id,
        reportLineId: line.id,
        amount: money(order.totalAmount),
        detail: `${order.reference} — colis déclaré perdu par le courier.`,
      });
      missingAmount = missingAmount.plus(money(order.totalAmount));
    } else if (paid.isPositive()) {
      // Money arrived for something the courier doesn't call delivered.
      paymentStatus = "PAID";
      paidAt = line.reportDate ?? now;
      discrepancies.push({
        type: "PAID_NOT_DELIVERED",
        orderId: order.id,
        reportLineId: line.id,
        amount: paid,
        detail: `${order.reference} — versement de ${paid.toFixed(2)} MAD reçu alors que le statut est « ${statusWord(status)} ».`,
      });
    } else {
      paymentStatus = "PENDING";
    }

    // Still moving and overdue? Flag it even though the report mentions it.
    if (isOpen(status) && order.shippedAt) {
      const age = daysBetween(order.shippedAt, now);
      if (age >= stuckAfterDays) {
        discrepancies.push({
          type: "STUCK_IN_TRANSIT",
          orderId: order.id,
          reportLineId: line.id,
          amount: money(order.totalAmount),
          detail: `${order.reference} — en transit depuis ${age} jours chez le courier.`,
        });
      }
    }

    orderUpdates.push({
      orderId: order.id,
      status,
      paymentStatus,
      amountPaid: paid,
      courierFee: fees.total,
      deliveredAt: status === "DELIVERED" ? (line.reportDate ?? now) : null,
      paidAt,
    });
  }

  // Lines the courier billed us for that match nothing we shipped.
  for (const line of unmatchedLines) {
    discrepancies.push({
      type: "UNMATCHED_REPORT_LINE",
      reportLineId: line.id,
      amount: money(line.codAmount ?? 0),
      detail: `Ligne courier ${line.trackingNumber ?? line.reference ?? line.phone ?? "?"} sans commande correspondante.`,
    });
  }

  for (const line of ambiguousLines) {
    discrepancies.push({
      type: "UNMATCHED_REPORT_LINE",
      reportLineId: line.id,
      amount: money(line.codAmount ?? 0),
      detail: `Plusieurs commandes partagent le numéro ${line.phone ?? "?"} — à rapprocher manuellement.`,
    });
  }

  // Orders no report line mentioned. Only meaningful for parcels already handed
  // to a courier — an order still sitting at the seller's has nothing to answer
  // for. Stuck takes priority so one order never raises two flags.
  for (const order of unmatchedOrders) {
    if (!order.shippedAt || !isOpen(order.status)) continue;

    const age = daysBetween(order.shippedAt, now);
    if (age >= stuckAfterDays) {
      discrepancies.push({
        type: "STUCK_IN_TRANSIT",
        orderId: order.id,
        amount: money(order.totalAmount),
        detail: `${order.reference} — expédiée il y a ${age} jours, toujours pas livrée.`,
      });
    } else {
      discrepancies.push({
        type: "UNMATCHED_ORDER",
        orderId: order.id,
        amount: money(order.totalAmount),
        detail: `${order.reference} — expédiée mais absente du rapport du courier.`,
      });
    }
  }

  return {
    matches,
    orderUpdates,
    discrepancies,
    stats: {
      linesTotal: lines.length,
      linesMatched: matches.length,
      linesUnmatched: unmatchedLines.length,
      linesAmbiguous: ambiguousLines.length,
      ordersTouched: orderUpdates.length,
      missingAmount: round(missingAmount),
    },
  };
}

function isOpen(status: OrderStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED" || status === "IN_TRANSIT";
}

function statusWord(status: OrderStatus): string {
  const words: Record<OrderStatus, string> = {
    PENDING: "en attente",
    CONFIRMED: "confirmée",
    IN_TRANSIT: "en transit",
    DELIVERED: "livrée",
    RETURNED: "retournée",
    REFUSED: "refusée",
    LOST: "perdue",
    CANCELLED: "annulée",
  };
  return words[status];
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10).split("-").reverse().join("/");
}
