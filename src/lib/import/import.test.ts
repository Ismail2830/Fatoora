import { test } from "node:test";
import assert from "node:assert/strict";

import { detectMapping, missingRequired } from "./detect";
import { ORDER_FIELD_SPECS, REPORT_FIELD_SPECS } from "./fields";
import { reportSpecsFor, resolveCourierSlug, type StoreCourier } from "./couriers";
import { mapOrderRows, mapReportRows } from "./map-rows";
import { readCsv } from "./read-file";
import type { ColumnMap, OrderField, ReportField } from "./types";

const STORE_COURIERS: StoreCourier[] = [
  { id: "c1", slug: "amana", name: "Amana" },
  { id: "c2", slug: "ozone", name: "Ozone Express" },
  { id: "c3", slug: "cathedis", name: "Cathedis" },
  { id: "c4", slug: "sendit", name: "Sendit" },
];

test("reads a semicolon-delimited CSV, as French Excel exports them", () => {
  const sheet = readCsv("reference;client;telephone\nCMD-1;Youssef;0612345678");
  assert.deepEqual(sheet.headers, ["reference", "client", "telephone"]);
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0]["client"], "Youssef");
});

test("reads a comma-delimited CSV without being told", () => {
  const sheet = readCsv("reference,client\nCMD-1,Youssef");
  assert.deepEqual(sheet.headers, ["reference", "client"]);
});

test("skips blank rows that spreadsheets leave behind", () => {
  const sheet = readCsv("a,b\n1,2\n,\n3,4\n");
  assert.equal(sheet.rows.length, 2);
});

test("auto-detects a hand-typed French order sheet", () => {
  const mapping = detectMapping(
    ["N° Commande", "Nom du client", "Téléphone", "Ville", "Montant", "Tracking"],
    ORDER_FIELD_SPECS,
  );
  assert.equal(mapping.reference, "N° Commande");
  assert.equal(mapping.customerName, "Nom du client");
  assert.equal(mapping.phone, "Téléphone");
  assert.equal(mapping.city, "Ville");
  assert.equal(mapping.totalAmount, "Montant");
  assert.equal(mapping.trackingNumber, "Tracking");
  assert.equal(missingRequired(mapping, ORDER_FIELD_SPECS).length, 0);
});

test("auto-detects a Shopify export", () => {
  const mapping = detectMapping(
    ["Name", "Billing Name", "Billing Phone", "Billing City", "Total", "Lineitem name"],
    ORDER_FIELD_SPECS,
  );
  assert.equal(mapping.customerName, "Billing Name");
  assert.equal(mapping.phone, "Billing Phone");
  assert.equal(mapping.city, "Billing City");
  assert.equal(mapping.totalAmount, "Total");
  assert.equal(mapping.productName, "Lineitem name");
});

test("one source column never feeds two fields", () => {
  // "Date" could match both orderedAt and other date-ish fields; whichever
  // scores highest claims it, and the loser stays unmapped.
  const mapping = detectMapping(["Date", "Date de livraison"], REPORT_FIELD_SPECS);
  const used = Object.values(mapping).filter(Boolean);
  assert.equal(new Set(used).size, used.length);
});

test("missingRequired names what still blocks the import", () => {
  const mapping = detectMapping(["Client", "Ville"], ORDER_FIELD_SPECS);
  const missing = missingRequired(mapping, ORDER_FIELD_SPECS).map((s) => s.field);
  assert.ok(missing.includes("reference"));
  assert.ok(missing.includes("phone"));
  assert.ok(missing.includes("totalAmount"));
});

test("a courier's own column names beat the generic aliases", () => {
  // Amana calls the tracking number "N° Envoi", which the generic specs miss.
  const specs = reportSpecsFor("amana");
  const mapping = detectMapping(["N° Envoi", "Etat Envoi", "Montant Mandat"], specs);
  assert.equal(mapping.trackingNumber, "N° Envoi");
  assert.equal(mapping.status, "Etat Envoi");
  assert.equal(mapping.paidAmount, "Montant Mandat");
});

const ORDER_MAP: ColumnMap<OrderField> = {
  reference: "ref",
  customerName: "client",
  phone: "tel",
  city: "ville",
  totalAmount: "montant",
};

test("maps a clean order sheet and normalises as it goes", () => {
  const result = mapOrderRows(
    [{ ref: "CMD-1", client: "Youssef", tel: "+212 612-345-678", ville: "casa", montant: "1 250,00" }],
    ORDER_MAP,
  );
  assert.equal(result.issues.length, 0);
  assert.equal(result.valid.length, 1);
  const row = result.valid[0];
  assert.equal(row.phone, "612345678");
  assert.equal(row.city, "Casablanca");
  assert.equal(row.totalAmount, 1250);
  assert.equal(row.quantity, 1);
});

test("one bad row does not sink the whole file", () => {
  // 397 good rows must still import; the seller sees exactly which 3 failed.
  const result = mapOrderRows(
    [
      { ref: "CMD-1", client: "A", tel: "0612345678", ville: "Rabat", montant: "100" },
      { ref: "", client: "B", tel: "0612345679", ville: "Rabat", montant: "100" },
      { ref: "CMD-3", client: "C", tel: "abc", ville: "Rabat", montant: "100" },
      { ref: "CMD-4", client: "D", tel: "0612345680", ville: "Rabat", montant: "n/a" },
      { ref: "CMD-5", client: "E", tel: "0612345681", ville: "Fes", montant: "200" },
    ],
    ORDER_MAP,
  );
  assert.equal(result.valid.length, 2);
  assert.equal(result.issues.length, 3);
  // Row numbers point at the spreadsheet row, counting the header.
  assert.deepEqual(result.issues.map((i) => i.rowNumber), [3, 4, 5]);
  assert.match(result.issues[1].message, /Téléphone invalide/);
  assert.match(result.issues[2].message, /Montant illisible/);
});

test("a duplicated reference inside one file is rejected", () => {
  const result = mapOrderRows(
    [
      { ref: "CMD-1", client: "A", tel: "0612345678", ville: "Rabat", montant: "100" },
      { ref: "CMD-1", client: "B", tel: "0612345679", ville: "Rabat", montant: "100" },
    ],
    ORDER_MAP,
  );
  assert.equal(result.valid.length, 1);
  assert.match(result.issues[0].message, /double/);
});

test("a missing quantity means one item, not zero", () => {
  const result = mapOrderRows(
    [{ ref: "CMD-1", client: "A", tel: "0612345678", ville: "Rabat", montant: "100", qte: "" }],
    { ...ORDER_MAP, quantity: "qte" },
  );
  assert.equal(result.valid[0].quantity, 1);
});

const REPORT_MAP: ColumnMap<ReportField> = {
  trackingNumber: "suivi",
  status: "etat",
  codAmount: "cod",
  paidAmount: "verse",
  reportDate: "date",
};

test("maps a courier report and reads its status wording", () => {
  const result = mapReportRows(
    [{ suivi: "AM-001", etat: "Livré", cod: "1000", verse: "945", date: "14/07/2026" }],
    REPORT_MAP,
    "generic",
  );
  assert.equal(result.issues.length, 0);
  const row = result.valid[0];
  assert.equal(row.statusNormalized, "DELIVERED");
  assert.equal(row.codAmount, 1000);
  assert.equal(row.paidAmount, 945);
  assert.equal(row.reportDate?.toISOString().slice(0, 10), "2026-07-14");
});

test("a courier's private wording is understood via its profile", () => {
  // "En instance" means in-transit at Amana, and matches nothing generic.
  const generic = mapReportRows([{ suivi: "AM-1", etat: "En instance" }], REPORT_MAP, "generic");
  assert.equal(generic.valid[0].statusNormalized, null);
  assert.equal(generic.warnings.length, 1);

  const amana = mapReportRows([{ suivi: "AM-1", etat: "En instance" }], REPORT_MAP, "amana");
  assert.equal(amana.valid[0].statusNormalized, "IN_TRANSIT");
  assert.equal(amana.warnings.length, 0);
});

test("an unknown status warns but still imports the line", () => {
  // Dropping it would understate what the courier owes.
  const result = mapReportRows(
    [{ suivi: "AM-1", etat: "BLA BLA", cod: "500" }],
    REPORT_MAP,
    "generic",
  );
  assert.equal(result.valid.length, 1);
  assert.equal(result.issues.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /Statut non reconnu/);
  assert.equal(result.valid[0].codAmount, 500);
});

test("a report line with nothing to match on is rejected", () => {
  const result = mapReportRows([{ suivi: "", etat: "Livré" }], REPORT_MAP, "generic");
  assert.equal(result.valid.length, 0);
  assert.match(result.issues[0].message, /Aucun identifiant/);
});

test("a report line matches on phone alone when tracking is absent", () => {
  const result = mapReportRows(
    [{ tel: "0612345678", etat: "Livré" }],
    { phone: "tel", status: "etat" },
    "generic",
  );
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].phone, "612345678");
});

test("an empty paid column stays null rather than becoming zero", () => {
  // null means "the courier said nothing"; 0 would mean "paid nothing".
  const result = mapReportRows(
    [{ suivi: "AM-1", etat: "Livré", cod: "1000", verse: "" }],
    REPORT_MAP,
    "generic",
  );
  assert.equal(result.valid[0].paidAmount, null);
});

// ---- courier resolution (one file, several couriers) --------------------

test("resolveCourierSlug matches names, slugs and casings", () => {
  assert.equal(resolveCourierSlug("Amana", STORE_COURIERS), "amana");
  assert.equal(resolveCourierSlug("AMANA", STORE_COURIERS), "amana");
  assert.equal(resolveCourierSlug("ozone", STORE_COURIERS), "ozone");
  assert.equal(resolveCourierSlug("Ozone Express", STORE_COURIERS), "ozone");
  // "OZONE" alone still reaches Ozone Express via the slug token.
  assert.equal(resolveCourierSlug("OZONE", STORE_COURIERS), "ozone");
});

test("resolveCourierSlug returns null rather than guessing", () => {
  assert.equal(resolveCourierSlug("DHL", STORE_COURIERS), null);
  assert.equal(resolveCourierSlug("", STORE_COURIERS), null);
  assert.equal(resolveCourierSlug(null, STORE_COURIERS), null);
});

test("one file with several couriers resolves each row's courier", () => {
  const rows = [
    { suivi: "AM-1", courier: "Amana", etat: "Livré" },
    { suivi: "OZ-1", courier: "Ozone Express", etat: "Livré paye" },
    { suivi: "SE-1", courier: "Sendit", etat: "delivered" },
  ];
  const result = mapReportRows(
    rows,
    { trackingNumber: "suivi", courier: "courier", status: "etat" },
    { couriers: STORE_COURIERS },
  );
  assert.equal(result.valid.length, 3);
  assert.deepEqual(
    result.valid.map((r) => r.courierSlug),
    ["amana", "ozone", "sendit"],
  );
  // "Livré paye" is Ozone's private wording; it only reads as delivered
  // because that row resolved to the ozone profile.
  assert.equal(result.valid[1].statusNormalized, "DELIVERED");
});

test("each row's status uses its own courier's vocabulary", () => {
  // "En instance" is Amana-only. On the Amana row it means in-transit; the
  // Sendit row's "En instance" is unknown and warns.
  const result = mapReportRows(
    [
      { suivi: "AM-1", courier: "Amana", etat: "En instance" },
      { suivi: "SE-1", courier: "Sendit", etat: "En instance" },
    ],
    { trackingNumber: "suivi", courier: "courier", status: "etat" },
    { couriers: STORE_COURIERS },
  );
  assert.equal(result.valid[0].statusNormalized, "IN_TRANSIT");
  assert.equal(result.valid[1].statusNormalized, null);
});

test("an unrecognised courier warns but the line still imports", () => {
  const result = mapReportRows(
    [{ suivi: "X-1", courier: "DHL", etat: "Livré" }],
    { trackingNumber: "suivi", courier: "courier", status: "etat" },
    { couriers: STORE_COURIERS },
  );
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].courierSlug, null);
  // Still read the status via the generic patterns.
  assert.equal(result.valid[0].statusNormalized, "DELIVERED");
  assert.ok(result.warnings.some((w) => /Courier non reconnu/.test(w.message)));
});

test("a blank courier column falls back to the provided default", () => {
  const result = mapReportRows(
    [{ suivi: "AM-1", courier: "", etat: "Livré" }],
    { trackingNumber: "suivi", courier: "courier", status: "etat" },
    { couriers: STORE_COURIERS, fallbackSlug: "amana" },
  );
  assert.equal(result.valid[0].courierSlug, "amana");
});

test("courier is auto-detected among the report columns", () => {
  const mapping = detectMapping(
    ["Tracking", "Transporteur", "Statut", "Montant"],
    REPORT_FIELD_SPECS,
  );
  assert.equal(mapping.courier, "Transporteur");
});
