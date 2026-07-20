import { test } from "node:test";
import assert from "node:assert/strict";

import { applyPayment } from "./resolve";

test("a full payment resolves to PAID", () => {
  const r = applyPayment({ expected: 945, alreadyPaid: 0, newAmount: 945 });
  assert.equal(r.paymentStatus, "PAID");
  assert.equal(r.amountPaid.toNumber(), 945);
});

test("a second partial payment adds to the first, not replaces it", () => {
  // Already had 400 recorded; chasing the rest got 545 more.
  const r = applyPayment({ expected: 945, alreadyPaid: 400, newAmount: 545 });
  assert.equal(r.paymentStatus, "PAID");
  assert.equal(r.amountPaid.toNumber(), 945);
});

test("still short of the expected amount stays PARTIAL", () => {
  const r = applyPayment({ expected: 945, alreadyPaid: 0, newAmount: 500 });
  assert.equal(r.paymentStatus, "PARTIAL");
  assert.equal(r.amountPaid.toNumber(), 500);
});

test("rounding to the dirham still counts as fully paid", () => {
  const r = applyPayment({ expected: 945, alreadyPaid: 0, newAmount: 944.5 });
  assert.equal(r.paymentStatus, "PAID");
});

test("an overpayment is PAID, not something stranger", () => {
  const r = applyPayment({ expected: 945, alreadyPaid: 0, newAmount: 1000 });
  assert.equal(r.paymentStatus, "PAID");
  assert.equal(r.amountPaid.toNumber(), 1000);
});
