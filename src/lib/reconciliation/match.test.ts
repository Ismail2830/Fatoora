import { test } from "node:test";
import assert from "node:assert/strict";

import { matchReportLines, type MatchableLine, type MatchableOrder } from "./match";

function order(over: Partial<MatchableOrder> = {}): MatchableOrder {
  return {
    id: "o1",
    reference: "CMD-2231",
    phone: "0612345678",
    trackingNumber: "AM-2231-X",
    courierId: "amana",
    ...over,
  };
}

function line(over: Partial<MatchableLine> = {}): MatchableLine {
  return { id: "l1", courierId: "amana", ...over };
}

test("matches on tracking number despite formatting differences", () => {
  const result = matchReportLines(
    [line({ trackingNumber: "am2231x" })],
    [order({ trackingNumber: "AM-2231-X" })],
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].matchedBy, "tracking");
  assert.equal(result.matches[0].orderId, "o1");
});

test("falls back to order reference when tracking is absent", () => {
  const result = matchReportLines(
    [line({ reference: "cmd 2231" })],
    [order({ trackingNumber: null })],
  );
  assert.equal(result.matches[0].matchedBy, "reference");
});

test("falls back to phone when nothing else identifies the parcel", () => {
  const result = matchReportLines(
    [line({ phone: "+212612345678" })],
    [order({ trackingNumber: null })],
  );
  assert.equal(result.matches[0].matchedBy, "phone");
});

test("tracking wins over phone when both are present", () => {
  // The phone points at o2, the tracking at o1. Tracking is authoritative.
  const result = matchReportLines(
    [line({ trackingNumber: "AM-2231-X", phone: "0699999999" })],
    [
      order({ id: "o1", trackingNumber: "AM-2231-X", phone: "0611111111" }),
      order({ id: "o2", trackingNumber: null, phone: "0699999999" }),
    ],
  );
  assert.equal(result.matches[0].orderId, "o1");
  assert.equal(result.matches[0].matchedBy, "tracking");
});

test("a repeat customer's shared phone is left ambiguous, never guessed", () => {
  // Two open orders on one number. Picking either would mark the wrong order
  // paid, so the line must surface for a human instead.
  const result = matchReportLines(
    [line({ phone: "0612345678" })],
    [
      order({ id: "o1", reference: "CMD-1", trackingNumber: null }),
      order({ id: "o2", reference: "CMD-2", trackingNumber: null }),
    ],
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.ambiguousLines.length, 1);
});

test("a shared phone still resolves when tracking disambiguates", () => {
  const result = matchReportLines(
    [line({ trackingNumber: "AM-2231-B", phone: "0612345678" })],
    [
      order({ id: "o1", trackingNumber: "AM-2231-A" }),
      order({ id: "o2", trackingNumber: "AM-2231-B" }),
    ],
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].orderId, "o2");
});

test("junk tracking values are ignored rather than matched on", () => {
  // Couriers write "-" or "NA" in the tracking column. Those must not become
  // a match key, or every such row would match every other such row.
  const result = matchReportLines(
    [line({ trackingNumber: "NA", phone: "0612345678" })],
    [order({ trackingNumber: "NA", phone: "0612345678" })],
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].matchedBy, "phone");
});

test("one order cannot be claimed by two lines", () => {
  const result = matchReportLines(
    [
      line({ id: "l1", trackingNumber: "AM-2231-X" }),
      line({ id: "l2", trackingNumber: "AM-2231-X" }),
    ],
    [order()],
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.unmatchedLines.length, 1);
  assert.equal(result.unmatchedLines[0].id, "l2");
});

test("a line never matches an order shipped with a different courier", () => {
  const result = matchReportLines(
    [line({ courierId: "ozone", phone: "0612345678" })],
    [order({ courierId: "amana", trackingNumber: null })],
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatchedLines.length, 1);
});

test("reports lines that match nothing and orders nobody mentioned", () => {
  const result = matchReportLines(
    [line({ id: "ghost", trackingNumber: "UNKNOWN-9" })],
    [order({ id: "lonely" })],
  );
  assert.equal(result.unmatchedLines.length, 1);
  assert.equal(result.unmatchedLines[0].id, "ghost");
  assert.equal(result.unmatchedOrders.length, 1);
  assert.equal(result.unmatchedOrders[0].id, "lonely");
});
