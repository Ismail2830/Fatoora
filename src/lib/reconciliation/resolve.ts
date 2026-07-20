import { Decimal, equalWithin, money, round } from "@/lib/money";

/**
 * What recording a real payment does to an order's payment state.
 *
 * Used when a seller resolves a DELIVERED_NOT_PAID or AMOUNT_MISMATCH
 * discrepancy by saying "the courier actually paid me X" — after chasing it,
 * not at import time. The new total is what's now been received in total,
 * not just this transaction, so a second partial payment adds to the first
 * rather than overwriting it.
 */
export function applyPayment(params: {
  expected: Decimal | number | string;
  alreadyPaid: Decimal | number | string;
  newAmount: Decimal | number | string;
  tolerance?: Decimal | number | string;
}): { amountPaid: Decimal; paymentStatus: "PAID" | "PARTIAL" } {
  const expected = money(params.expected);
  const total = round(money(params.alreadyPaid).plus(money(params.newAmount)));
  const tolerance = params.tolerance ?? 1;

  const paymentStatus = equalWithin(total, expected, tolerance) || total.greaterThan(expected)
    ? "PAID"
    : "PARTIAL";

  return { amountPaid: total, paymentStatus };
}
