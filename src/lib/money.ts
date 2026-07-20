import { Decimal } from "@prisma/client/runtime/client";

export { Decimal };

/** Anything that can stand in for a MAD amount coming out of Prisma or a form. */
export type MoneyInput = Decimal | number | string | null | undefined;

/** Coerce to Decimal, treating null/undefined/garbage as 0. */
export function money(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  try {
    return new Decimal(value as Decimal.Value);
  } catch {
    return new Decimal(0);
  }
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0));
}

/** Percentage of an amount, e.g. pct(1000, 3) === 30. Rounds to centimes. */
export function pct(amount: MoneyInput, percent: MoneyInput): Decimal {
  return round(money(amount).times(money(percent)).dividedBy(100));
}

/** Round half-up to 2dp — the rule couriers and accountants use. */
export function round(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Decimals are not JSON-serialisable, so cross the server/client line here. */
export function toNumber(value: MoneyInput): number {
  return money(value).toNumber();
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero();
}

/**
 * Two amounts are "the same" if they differ by at most `tolerance`.
 * Couriers routinely round to the dirham, so an exact match is too strict —
 * without a tolerance every second order would raise a false discrepancy.
 */
export function equalWithin(a: MoneyInput, b: MoneyInput, tolerance: MoneyInput = 1): boolean {
  return money(a).minus(money(b)).abs().lessThanOrEqualTo(money(tolerance));
}

// Deliberately fr-FR, not fr-MA: fr-MA groups thousands with a dot
// ("128.450"), which reads as a decimal point to anyone scanning a money
// column. fr-FR groups with a space, matching the reference design.
const nf = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "128 450" — grouped the way the design shows it, no currency suffix. */
export function formatAmount(value: MoneyInput): string {
  // fr-FR groups with U+202F (narrow no-break space), and some runtimes
  // use U+00A0. Normalise both to a plain space so server and client render
  // the identical string — a mismatch here surfaces as a hydration error.
  return nf.format(toNumber(value)).replace(/[\u202F\u00A0]/g, " ");
}

/** "128 450 MAD" */
export function formatMAD(value: MoneyInput): string {
  return `${formatAmount(value)} MAD`;
}

/** "+320 MAD" / "−450 MAD" — signed, using a real minus sign like the design. */
export function formatSigned(value: MoneyInput): string {
  const d = money(value);
  const sign = d.isNegative() ? "−" : "+";
  return `${sign}${formatAmount(d.abs())} MAD`;
}

/** "73%" — ratio helper that refuses to divide by zero. */
export function percentOf(part: MoneyInput, whole: MoneyInput): number {
  const w = money(whole);
  if (w.isZero()) return 0;
  return money(part).dividedBy(w).times(100).toNumber();
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}
