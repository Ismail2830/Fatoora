import { test } from "node:test";
import assert from "node:assert/strict";

import { parseWhatsAppOrder } from "./parse-whatsapp";

test("parses a typical Darija WhatsApp order", () => {
  const result = parseWhatsAppOrder(`
Salam, bghit montre homme classique
Youssef Alaoui
0612345678
Casablanca, Hay Mohammadi rue 5
299 dh
`);
  assert.equal(result.phone.value, "612345678");
  assert.equal(result.city.value, "Casablanca");
  assert.equal(result.totalAmount.value, 299);
  assert.equal(result.customerName.value, "Youssef Alaoui");
  assert.match(result.address.value ?? "", /Hay Mohammadi/);
});

test("reads the sender's name from a real WhatsApp export", () => {
  // The export tells us who is talking, which beats any heuristic.
  const result = parseWhatsAppOrder(`
[15/07/2026, 14:23] Salma Bennani: salam
[15/07/2026, 14:23] Salma Bennani: bghit parfum
[15/07/2026, 14:24] Salma Bennani: 0655443322
[15/07/2026, 14:24] Salma Bennani: Rabat
[15/07/2026, 14:25] Salma Bennani: 249 MAD
`);
  assert.equal(result.customerName.value, "Salma Bennani");
  assert.equal(result.customerName.confidence, "high");
  assert.equal(result.phone.value, "655443322");
  assert.equal(result.city.value, "Rabat");
  assert.equal(result.totalAmount.value, 249);
});

test("finds the phone in any format a customer types", () => {
  for (const input of ["0612345678", "+212 612 345 678", "06 12 34 56 78", "212612345678"]) {
    assert.equal(parseWhatsAppOrder(input).phone.value, "612345678", `failed for ${input}`);
  }
});

test("recognises cities by their transliterations", () => {
  assert.equal(parseWhatsAppOrder("livraison a Casa svp").city.value, "Casablanca");
  assert.equal(parseWhatsAppOrder("je suis a FES").city.value, "Fès");
  assert.equal(parseWhatsAppOrder("marrakesh").city.value, "Marrakech");
});

test("a multi-word city beats a shorter one inside it", () => {
  // "beni mellal" must not be read as some stray "beni".
  assert.equal(parseWhatsAppOrder("adresse: Beni Mellal centre").city.value, "Béni Mellal");
});

test("prefers the number carrying a currency over any other number", () => {
  // The house number must not become the price.
  const result = parseWhatsAppOrder("Rue 15 imm 8 apt 3, Rabat\n450 dh");
  assert.equal(result.totalAmount.value, 450);
  assert.equal(result.totalAmount.confidence, "high");
});

test("a price never absorbs a number from the line above", () => {
  // "Rue 5" then "299 dh" must be 299, not 5299. Whitespace matching that
  // crosses newlines quotes the customer a wildly wrong total.
  const result = parseWhatsAppOrder("Casablanca, Hay Mohammadi rue 5\n299 dh");
  assert.equal(result.totalAmount.value, 299);
});

test("reads a labelled price", () => {
  assert.equal(parseWhatsAppOrder("prix: 1250").totalAmount.value, 1250);
  assert.equal(parseWhatsAppOrder("Total 349").totalAmount.value, 349);
});

test("a bare number is offered but flagged as a guess", () => {
  const result = parseWhatsAppOrder("bghit chi haja 299");
  assert.equal(result.totalAmount.value, 299);
  // Low confidence: the UI must ask rather than assume.
  assert.equal(result.totalAmount.confidence, "low");
});

test("the phone is never mistaken for the price", () => {
  const result = parseWhatsAppOrder("0612345678");
  assert.equal(result.phone.value, "612345678");
  assert.equal(result.totalAmount.value, null);
});

test("reads quantity, defaulting to one item", () => {
  assert.equal(parseWhatsAppOrder("2x montre").quantity.value, 2);
  assert.equal(parseWhatsAppOrder("3 pcs parfum").quantity.value, 3);
  // Nothing said means one — never zero.
  assert.equal(parseWhatsAppOrder("montre").quantity.value, 1);
});

test("picks up a labelled product", () => {
  const result = parseWhatsAppOrder("Produit: Casque Bluetooth\n0612345678");
  assert.equal(result.productName.value, "Casque Bluetooth");
  assert.equal(result.productName.confidence, "high");
});

test("picks up the product after bghit", () => {
  const result = parseWhatsAppOrder("salam bghit casque bluetooth\n0612345678\nRabat");
  assert.match(result.productName.value ?? "", /casque bluetooth/i);
});

test("returns nothing rather than guessing on an empty paste", () => {
  const result = parseWhatsAppOrder("");
  assert.equal(result.phone.value, null);
  assert.equal(result.city.value, null);
  assert.equal(result.customerName.value, null);
  assert.equal(result.totalAmount.value, null);
});

test("a greeting alone yields no order", () => {
  const result = parseWhatsAppOrder("salam khouya labas?");
  assert.equal(result.phone.value, null);
  assert.equal(result.totalAmount.value, null);
  // "salam khouya labas?" is noise, not a customer name.
  assert.equal(result.customerName.value, null);
});

test("does not mistake the city line for the customer name", () => {
  const result = parseWhatsAppOrder("Hamza Tazi\nCasablanca\n0612345678\n199 dh");
  assert.equal(result.customerName.value, "Hamza Tazi");
  assert.equal(result.city.value, "Casablanca");
});
