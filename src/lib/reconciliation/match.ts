import { normalizePhone, normalizeReference, normalizeTracking } from "./normalize";

/** The order fields matching needs. Keeps this module DB-free and testable. */
export type MatchableOrder = {
  id: string;
  reference: string;
  phone: string;
  trackingNumber?: string | null;
  courierId?: string | null;
};

/** The report-line fields matching needs. */
export type MatchableLine = {
  id: string;
  trackingNumber?: string | null;
  phone?: string | null;
  reference?: string | null;
  courierId?: string | null;
};

/** How a line was tied to an order, most trustworthy first. */
export type MatchStrategy = "tracking" | "reference" | "phone";

export type Match = {
  lineId: string;
  orderId: string;
  matchedBy: MatchStrategy;
};

/**
 * Generic over the caller's row types so callers get their own richer objects
 * back (with amounts, dates, ...) rather than these bare matching shapes.
 */
export type MatchResult<L extends MatchableLine, O extends MatchableOrder> = {
  matches: Match[];
  /** Lines that matched nothing — the courier billing us for a mystery parcel. */
  unmatchedLines: L[];
  /** Orders no line mentioned. */
  unmatchedOrders: O[];
  /**
   * Lines whose only candidate was a phone number shared by several orders.
   * Left unmatched on purpose — see matchReportLines.
   */
  ambiguousLines: L[];
};

/** Group values into buckets, skipping null keys. */
function indexBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Tie each courier report line to one of the seller's orders.
 *
 * Strategies run strongest-first and an order can only be claimed once:
 *
 *  1. Tracking number — assigned by the courier, unique, always correct when present.
 *  2. Order reference — reliable, but only when the seller put it on the parcel.
 *  3. Phone number — the last resort. Works because COD parcels always carry a
 *     phone, but a repeat customer has several orders on one number.
 *
 * A phone match is only accepted when it identifies exactly one candidate
 * order. Guessing between a customer's two orders would silently mark the
 * wrong one paid, which is worse than showing the seller an unmatched line —
 * a visible gap gets fixed, a wrong match becomes a wrong bank balance.
 */
export function matchReportLines<L extends MatchableLine, O extends MatchableOrder>(
  lines: L[],
  orders: O[],
): MatchResult<L, O> {
  const matches: Match[] = [];
  const unmatchedLines: L[] = [];
  const ambiguousLines: L[] = [];
  const claimedOrders = new Set<string>();

  const byTracking = indexBy(orders, (o) => normalizeTracking(o.trackingNumber));
  const byReference = indexBy(orders, (o) => normalizeReference(o.reference));
  const byPhone = indexBy(orders, (o) => normalizePhone(o.phone));

  /** Candidates from one bucket that are still free and on the same courier. */
  const available = (bucket: O[] | undefined, line: L) => {
    if (!bucket) return [];
    return bucket.filter((o) => {
      if (claimedOrders.has(o.id)) return false;
      // A line from Amana must not match an order shipped with Ozone. When
      // either side has no courier recorded, fall through and allow it.
      if (line.courierId && o.courierId && line.courierId !== o.courierId) return false;
      return true;
    });
  };

  for (const line of lines) {
    const tracking = normalizeTracking(line.trackingNumber);
    if (tracking) {
      const [order] = available(byTracking.get(tracking), line);
      if (order) {
        matches.push({ lineId: line.id, orderId: order.id, matchedBy: "tracking" });
        claimedOrders.add(order.id);
        continue;
      }
    }

    const reference = normalizeReference(line.reference);
    if (reference) {
      const [order] = available(byReference.get(reference), line);
      if (order) {
        matches.push({ lineId: line.id, orderId: order.id, matchedBy: "reference" });
        claimedOrders.add(order.id);
        continue;
      }
    }

    const phone = normalizePhone(line.phone);
    if (phone) {
      const candidates = available(byPhone.get(phone), line);
      if (candidates.length === 1) {
        matches.push({ lineId: line.id, orderId: candidates[0].id, matchedBy: "phone" });
        claimedOrders.add(candidates[0].id);
        continue;
      }
      if (candidates.length > 1) {
        // One customer, several open orders: a coin flip here corrupts the
        // books, so hand it to the seller to resolve.
        ambiguousLines.push(line);
        continue;
      }
    }

    unmatchedLines.push(line);
  }

  const unmatchedOrders = orders.filter((o) => !claimedOrders.has(o.id));

  return { matches, unmatchedLines, unmatchedOrders, ambiguousLines };
}
