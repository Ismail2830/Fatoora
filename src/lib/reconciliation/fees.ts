import { Decimal, money, pct, round } from "@/lib/money";
import { normalizeCity } from "./normalize";
import type { OrderStatus } from "@/generated/prisma/enums";

/** Just the fee fields, so this module works with plain objects in tests. */
export type FeeRule = {
  city: string | null;
  deliveredFee: Decimal | number | string;
  returnFee: Decimal | number | string;
  codPercent: Decimal | number | string;
};

export type FeeBreakdown = {
  /** Flat fee for the delivery attempt. */
  deliveredFee: Decimal;
  /** Flat fee charged when the parcel comes back. */
  returnFee: Decimal;
  /** Courier's cut of the collected COD amount. */
  codFee: Decimal;
  /** What the courier keeps in total. */
  total: Decimal;
  /** What the seller should actually receive. Never negative. */
  expectedPayout: Decimal;
};

const ZERO_RULE: FeeRule = {
  city: null,
  deliveredFee: 0,
  returnFee: 0,
  codPercent: 0,
};

/**
 * Pick the rule that applies to a city: an exact (normalized) city rule wins,
 * otherwise the courier's default rule (city === null). Falls back to all-zero
 * so an unconfigured courier reports no fees rather than crashing the run.
 */
export function resolveFeeRule(rules: FeeRule[], city: string | null | undefined): FeeRule {
  const key = normalizeCity(city);

  if (key) {
    const exact = rules.find((r) => normalizeCity(r.city) === key);
    if (exact) return exact;
  }

  return rules.find((r) => r.city === null) ?? ZERO_RULE;
}

/**
 * What the courier charges for an order, and what should land in the bank.
 *
 * The two cases that matter:
 *  - Delivered: courier takes a flat fee plus a percentage of the COD amount,
 *    and remits the rest.
 *  - Returned/refused: nothing was collected, but most Moroccan couriers still
 *    bill a return fee. That fee is pure loss and is why a product with a high
 *    refusal rate can look profitable on paper and lose money in the bank.
 */
export function computeFees(
  params: {
    status: OrderStatus;
    totalAmount: Decimal | number | string;
    city?: string | null;
  },
  rules: FeeRule[],
): FeeBreakdown {
  const rule = resolveFeeRule(rules, params.city);
  const total = money(params.totalAmount);

  if (params.status === "DELIVERED") {
    const deliveredFee = round(rule.deliveredFee);
    const codFee = pct(total, rule.codPercent);
    const charged = round(deliveredFee.plus(codFee));
    return {
      deliveredFee,
      returnFee: new Decimal(0),
      codFee,
      total: charged,
      // A fee larger than the order would imply the courier owes nothing and
      // the seller owes them — that debt is tracked as a fee, not a payout.
      expectedPayout: Decimal.max(round(total.minus(charged)), new Decimal(0)),
    };
  }

  if (params.status === "RETURNED" || params.status === "REFUSED") {
    const returnFee = round(rule.returnFee);
    return {
      deliveredFee: new Decimal(0),
      returnFee,
      codFee: new Decimal(0),
      total: returnFee,
      expectedPayout: new Decimal(0),
    };
  }

  // Lost, cancelled, or still moving: no money expected either way. A lost
  // parcel's loss is the goods, which profit reporting handles separately.
  return {
    deliveredFee: new Decimal(0),
    returnFee: new Decimal(0),
    codFee: new Decimal(0),
    total: new Decimal(0),
    expectedPayout: new Decimal(0),
  };
}
