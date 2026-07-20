import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalCity,
  normalizePhone,
  normalizeReference,
  normalizeStatus,
  normalizeTracking,
  parseAmount,
  parseDate,
} from "./normalize";

test("normalizePhone folds every Moroccan format to 9 digits", () => {
  const expected = "612345678";
  for (const input of [
    "0612345678",
    "+212612345678",
    "212612345678",
    "00212612345678",
    "06 12 34 56 78",
    "06-12-34-56-78",
    "612345678",
    " 0612345678 ",
  ]) {
    assert.equal(normalizePhone(input), expected, `failed for ${input}`);
  }
});

test("normalizePhone rejects values too short to be a number", () => {
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone("abc"), null);
});

test("two spellings of one number match after normalizing", () => {
  assert.equal(normalizePhone("+212 612-345-678"), normalizePhone("0612345678"));
});

test("normalizeTracking ignores case and punctuation", () => {
  assert.equal(normalizeTracking("am-2231 x"), "AM2231X");
  assert.equal(normalizeTracking("AM2231X"), "AM2231X");
  assert.equal(normalizeTracking("abc"), null);
});

test("normalizeReference folds the ways sellers write an order id", () => {
  assert.equal(normalizeReference("cmd-2231"), "CMD2231");
  assert.equal(normalizeReference("CMD 2231"), "CMD2231");
  assert.equal(normalizeReference("#CMD2231"), "CMD2231");
});

test("canonicalCity unifies transliterations", () => {
  assert.equal(canonicalCity("FES"), "Fès");
  assert.equal(canonicalCity("fès"), "Fès");
  assert.equal(canonicalCity("Casa"), "Casablanca");
  assert.equal(canonicalCity("marrakesh"), "Marrakech");
  // Unknown cities still come back presentable.
  assert.equal(canonicalCity("ouarzazate"), "Ouarzazate");
});

test("normalizeStatus reads the wordings couriers actually use", () => {
  assert.equal(normalizeStatus("Livré"), "DELIVERED");
  assert.equal(normalizeStatus("LIVREE"), "DELIVERED");
  assert.equal(normalizeStatus("Delivered"), "DELIVERED");
  assert.equal(normalizeStatus("En cours de livraison"), "IN_TRANSIT");
  assert.equal(normalizeStatus("Retourné à l'expéditeur"), "RETURNED");
  assert.equal(normalizeStatus("Colis perdu"), "LOST");
  assert.equal(normalizeStatus("Annulé"), "CANCELLED");
});

test("a refusal is REFUSED even when the courier also says retour", () => {
  // Couriers write "retour apres refus client" — matching "retour" first would
  // mislabel a refusal as a plain return and hide the real reason.
  assert.equal(normalizeStatus("Retour apres refus client"), "REFUSED");
  assert.equal(normalizeStatus("Refusé par le client"), "REFUSED");
});

test("normalizeStatus returns null rather than guessing", () => {
  assert.equal(normalizeStatus("blah blah"), null);
  assert.equal(normalizeStatus(""), null);
  assert.equal(normalizeStatus(null), null);
});

test("parseAmount handles the separator styles in courier files", () => {
  assert.equal(parseAmount("1 250,00"), 1250);
  assert.equal(parseAmount("1,250.00"), 1250);
  assert.equal(parseAmount("1.250,50"), 1250.5);
  assert.equal(parseAmount("1250 DH"), 1250);
  assert.equal(parseAmount("320 MAD"), 320);
  assert.equal(parseAmount("1250"), 1250);
  assert.equal(parseAmount(1250.5), 1250.5);
  assert.equal(parseAmount("0"), 0);
});

test("parseAmount distinguishes grouping from decimals", () => {
  assert.equal(parseAmount("1,250"), 1250); // three trailing digits => grouping
  assert.equal(parseAmount("1,25"), 1.25); // two => decimal
  assert.equal(parseAmount("1.250"), 1250);
});

test("parseAmount reads negatives, including accounting parentheses", () => {
  assert.equal(parseAmount("-450"), -450);
  assert.equal(parseAmount("(450)"), -450);
});

test("parseAmount returns null, not 0, when it cannot parse", () => {
  // 0 is a legitimate amount; conflating the two would invent discrepancies.
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount("n/a"), null);
  assert.equal(parseAmount("-"), null);
});

test("parseDate reads Moroccan files as day-first", () => {
  // The whole point: 01/02/2026 is 1 February, never 2 January.
  const d = parseDate("01/02/2026");
  assert.ok(d);
  assert.equal(d.getUTCDate(), 1);
  assert.equal(d.getUTCMonth(), 1);
  assert.equal(d.getUTCFullYear(), 2026);
});

test("parseDate accepts the other shapes couriers export", () => {
  assert.equal(parseDate("2026-07-15")?.toISOString().slice(0, 10), "2026-07-15");
  assert.equal(parseDate("15/07/2026")?.toISOString().slice(0, 10), "2026-07-15");
  assert.equal(parseDate("15-07-2026")?.toISOString().slice(0, 10), "2026-07-15");
  assert.equal(parseDate("15/07/26")?.toISOString().slice(0, 10), "2026-07-15");
});

test("parseDate converts Excel serial numbers", () => {
  // Excel stores dates as days since 1899-12-30; 46218 is 2026-07-15.
  assert.equal(parseDate(46218)?.toISOString().slice(0, 10), "2026-07-15");
});

test("parseDate rejects nonsense", () => {
  assert.equal(parseDate("32/13/2026"), null);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(null), null);
});
