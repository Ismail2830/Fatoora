import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcile, type EngineLine, type EngineOrder } from "./engine";
import type { FeeRule } from "./fees";
import type { DiscrepancyType } from "@/generated/prisma/enums";

const NOW = new Date("2026-07-15T12:00:00Z");

/** Amana: 25 MAD per delivery, 3% of COD, 15 MAD to bring a parcel back. */
const AMANA_RULES: FeeRule[] = [
  { city: null, deliveredFee: 25, returnFee: 15, codPercent: 3 },
];

function order(over: Partial<EngineOrder> = {}): EngineOrder {
  return {
    id: "o1",
    reference: "CMD-2231",
    phone: "0612345678",
    city: "Casablanca",
    trackingNumber: "AM-2231-X",
    courierId: "amana",
    totalAmount: 1000,
    status: "IN_TRANSIT",
    paymentStatus: "PENDING",
    shippedAt: new Date("2026-07-13T09:00:00Z"),
    orderedAt: new Date("2026-07-12T09:00:00Z"),
    ...over,
  };
}

function line(over: Partial<EngineLine> = {}): EngineLine {
  return {
    id: "l1",
    courierId: "amana",
    trackingNumber: "AM-2231-X",
    reportDate: new Date("2026-07-14T09:00:00Z"),
    ...over,
  };
}

function run(orders: EngineOrder[], lines: EngineLine[], stuckAfterDays = 7) {
  return reconcile({
    orders,
    lines,
    feeRules: { amana: AMANA_RULES },
    stuckAfterDays,
    now: NOW,
  });
}

function typesOf(result: ReturnType<typeof run>): DiscrepancyType[] {
  return result.discrepancies.map((d) => d.type);
}

test("delivered and correctly paid raises nothing", () => {
  // 1000 - 25 flat - 3% (30) = 945 expected.
  const result = run(
    [order()],
    [line({ statusNormalized: "DELIVERED", codAmount: 1000, paidAmount: 945 })],
  );
  assert.deepEqual(typesOf(result), []);
  assert.equal(result.orderUpdates[0].paymentStatus, "PAID");
  assert.equal(result.orderUpdates[0].status, "DELIVERED");
  assert.equal(result.stats.missingAmount.toNumber(), 0);
});

test("delivered but never paid is flagged for the full expected payout", () => {
  // This is the headline number on the dashboard.
  const result = run(
    [order()],
    [line({ statusNormalized: "DELIVERED", codAmount: 1000, paidAmount: null })],
  );
  assert.deepEqual(typesOf(result), ["DELIVERED_NOT_PAID"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), 945);
  assert.equal(result.stats.missingAmount.toNumber(), 945);
  assert.equal(result.orderUpdates[0].paymentStatus, "PENDING");
});

test("a zero payment counts as not paid, not as paid-in-full", () => {
  const result = run(
    [order()],
    [line({ statusNormalized: "DELIVERED", codAmount: 1000, paidAmount: 0 })],
  );
  assert.deepEqual(typesOf(result), ["DELIVERED_NOT_PAID"]);
});

test("underpayment reports the shortfall, not the whole amount", () => {
  const result = run(
    [order()],
    [line({ statusNormalized: "DELIVERED", codAmount: 1000, paidAmount: 900 })],
  );
  assert.deepEqual(typesOf(result), ["AMOUNT_MISMATCH"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), 45);
  assert.equal(result.orderUpdates[0].paymentStatus, "PARTIAL");
  assert.equal(result.stats.missingAmount.toNumber(), 45);
});

test("rounding to the dirham does not invent a discrepancy", () => {
  // Couriers round. Expected 945, paid 944.5 — inside tolerance, so silent.
  const result = run(
    [order()],
    [line({ statusNormalized: "DELIVERED", paidAmount: 944.5 })],
  );
  assert.deepEqual(typesOf(result), []);
  assert.equal(result.orderUpdates[0].paymentStatus, "PAID");
});

test("an overpayment is flagged but never counted as money missing", () => {
  const result = run(
    [order()],
    [line({ statusNormalized: "DELIVERED", paidAmount: 1000 })],
  );
  assert.deepEqual(typesOf(result), ["AMOUNT_MISMATCH"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), -55);
  // The seller is not owed anything here, so the alert total must not move.
  assert.equal(result.stats.missingAmount.toNumber(), 0);
});

test("a return charges the return fee and expects no payout", () => {
  const result = run([order()], [line({ statusNormalized: "RETURNED" })]);
  assert.deepEqual(typesOf(result), ["RETURN_FEE_CHARGED"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), 15);
  assert.equal(result.orderUpdates[0].paymentStatus, "NOT_APPLICABLE");
  assert.equal(result.orderUpdates[0].courierFee.toNumber(), 15);
  // A return must never look like missing cash — nothing was ever collected.
  assert.equal(result.stats.missingAmount.toNumber(), 0);
});

test("a refusal is treated like a return for fees", () => {
  const result = run([order()], [line({ statusNormalized: "REFUSED" })]);
  assert.deepEqual(typesOf(result), ["RETURN_FEE_CHARGED"]);
  assert.equal(result.orderUpdates[0].status, "REFUSED");
});

test("a lost parcel counts the whole order as missing", () => {
  const result = run([order()], [line({ statusNormalized: "LOST" })]);
  assert.deepEqual(typesOf(result), ["LOST"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), 1000);
  assert.equal(result.stats.missingAmount.toNumber(), 1000);
});

test("cash arriving for an undelivered parcel is flagged", () => {
  const result = run(
    [order()],
    [line({ statusNormalized: "IN_TRANSIT", paidAmount: 500 })],
  );
  assert.ok(typesOf(result).includes("PAID_NOT_DELIVERED"));
});

test("the courier report overrides the seller's own status", () => {
  const result = run(
    [order({ status: "IN_TRANSIT" })],
    [line({ statusNormalized: "DELIVERED", paidAmount: 945 })],
  );
  assert.equal(result.orderUpdates[0].status, "DELIVERED");
  assert.equal(result.orderUpdates[0].deliveredAt?.toISOString().slice(0, 10), "2026-07-14");
});

test("a courier line with no matching order is flagged", () => {
  const result = run([], [line({ trackingNumber: "GHOST-999", codAmount: 400 })]);
  assert.deepEqual(typesOf(result), ["UNMATCHED_REPORT_LINE"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), 400);
});

test("a shipped order missing from the report is flagged", () => {
  const result = run([order({ shippedAt: new Date("2026-07-14T09:00:00Z") })], []);
  assert.deepEqual(typesOf(result), ["UNMATCHED_ORDER"]);
});

test("an order sitting too long in transit is flagged as stuck, not unmatched", () => {
  // Shipped 2026-07-01, now 2026-07-15 => 14 days, past the 7-day threshold.
  const result = run([order({ shippedAt: new Date("2026-07-01T09:00:00Z") })], []);
  assert.deepEqual(typesOf(result), ["STUCK_IN_TRANSIT"]);
  assert.match(result.discrepancies[0].detail, /14 jours/);
});

test("an order never handed to a courier is nobody's fault", () => {
  // Not shipped yet, so its absence from the report means nothing.
  const result = run([order({ status: "PENDING", shippedAt: null })], []);
  assert.deepEqual(typesOf(result), []);
});

test("the stuck threshold is the store's, not a constant", () => {
  const orders = [order({ shippedAt: new Date("2026-07-11T09:00:00Z") })]; // 4 days
  assert.deepEqual(typesOf(run(orders, [], 7)), ["UNMATCHED_ORDER"]);
  assert.deepEqual(typesOf(run(orders, [], 3)), ["STUCK_IN_TRANSIT"]);
});

test("a courier with no fee rules configured expects the full amount", () => {
  const result = reconcile({
    orders: [order({ courierId: "unknown-courier" })],
    lines: [line({ courierId: "unknown-courier", statusNormalized: "DELIVERED" })],
    feeRules: {},
    stuckAfterDays: 7,
    now: NOW,
  });
  // No rules means no fees — expect the whole 1000 rather than crashing.
  assert.deepEqual(typesOf(result), ["DELIVERED_NOT_PAID"]);
  assert.equal(result.discrepancies[0].amount.toNumber(), 1000);
});

test("per-city fee rules beat the courier default", () => {
  const result = reconcile({
    orders: [order({ city: "Agadir" })],
    lines: [line({ statusNormalized: "DELIVERED", paidAmount: 920 })],
    feeRules: {
      amana: [
        { city: null, deliveredFee: 25, returnFee: 15, codPercent: 3 },
        // Agadir is far, so this seller negotiated a higher flat fee.
        { city: "Agadir", deliveredFee: 50, returnFee: 30, codPercent: 3 },
      ],
    },
    stuckAfterDays: 7,
    now: NOW,
  });
  // 1000 - 50 - 30 = 920, so the Agadir rule makes this exactly right.
  assert.deepEqual(typesOf(result), []);
  assert.equal(result.orderUpdates[0].courierFee.toNumber(), 80);
});

test("a whole batch reconciles into one set of totals", () => {
  const result = run(
    [
      order({ id: "a", reference: "CMD-1", trackingNumber: "AM-0001" }),
      order({ id: "b", reference: "CMD-2", trackingNumber: "AM-0002" }),
      order({ id: "c", reference: "CMD-3", trackingNumber: "AM-0003" }),
    ],
    [
      line({ id: "l1", trackingNumber: "AM-0001", statusNormalized: "DELIVERED", paidAmount: 945 }),
      line({ id: "l2", trackingNumber: "AM-0002", statusNormalized: "DELIVERED", paidAmount: null }),
      line({ id: "l3", trackingNumber: "AM-0003", statusNormalized: "RETURNED" }),
    ],
  );
  assert.equal(result.stats.linesTotal, 3);
  assert.equal(result.stats.linesMatched, 3);
  assert.equal(result.stats.linesUnmatched, 0);
  // Only the unpaid delivery is real missing cash.
  assert.equal(result.stats.missingAmount.toNumber(), 945);
});
