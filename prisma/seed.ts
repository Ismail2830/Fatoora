import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { OrderStatus } from "../src/generated/prisma/enums";

/**
 * Realistic demo data for a Moroccan COD seller.
 *
 * The point is not volume, it's shape: the reconciliation and profit screens
 * are only meaningful if the data contains the problems they exist to surface.
 * So this deliberately plants unpaid deliveries, underpayments, a courier line
 * matching no order, parcels stuck in transit, and one product whose refusal
 * rate quietly eats its margin.
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set — see .env.example");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Deterministic PRNG so re-seeding gives the same store, which makes the
// numbers on screen stable while developing.
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

const NOW = new Date();
function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(randInt(8, 18), randInt(0, 59), 0, 0);
  return d;
}

/** Weighted so Casablanca dominates, as it does in reality. */
const CITIES = [
  ...Array(8).fill("Casablanca"),
  ...Array(4).fill("Rabat"),
  ...Array(3).fill("Marrakech"),
  ...Array(3).fill("Tanger"),
  ...Array(2).fill("Fès"),
  ...Array(2).fill("Agadir"),
  ...Array(2).fill("Salé"),
  "Meknès",
  "Oujda",
  "Kénitra",
  "Tétouan",
  "Nador",
  "El Jadida",
  "Béni Mellal",
  "Safi",
];

const FIRST_NAMES = [
  "Youssef", "Fatima", "Mohamed", "Salma", "Hamza", "Khadija", "Omar", "Imane",
  "Anas", "Nadia", "Yassine", "Sanaa", "Reda", "Meryem", "Karim", "Hind",
  "Bilal", "Asmae", "Soufiane", "Zineb", "Mehdi", "Rajae", "Ayoub", "Loubna",
];
const LAST_NAMES = [
  "Alaoui", "Benali", "Cherkaoui", "Idrissi", "El Amrani", "Bennani", "Tazi",
  "Fassi", "Berrada", "Lahlou", "Sebti", "Kadiri", "Ouazzani", "Naciri",
];

/**
 * Stored normalized (9 digits, no leading zero) — the same shape the importer
 * writes. Phone is a match key, so every writer must agree on its format;
 * display adds the 0 back via formatPhone().
 */
function phone(): string {
  return `6${randInt(10000000, 99999999)}`;
}

async function main() {
  console.log("Seeding Fatora demo data…");

  // Idempotent: wipe the demo store so re-running doesn't pile up duplicates.
  const existing = await db.user.findUnique({
    where: { email: "demo@fatora.ma" },
    include: { memberships: true },
  });
  if (existing) {
    for (const m of existing.memberships) {
      await db.store.delete({ where: { id: m.storeId } }).catch(() => {});
    }
    await db.user.delete({ where: { id: existing.id } }).catch(() => {});
    console.log("  removed previous demo store");
  }

  const store = await db.store.create({ data: { name: "Zenith Store", stuckAfterDays: 7 } });

  await db.user.create({
    data: {
      name: "Youssef B.",
      email: "demo@fatora.ma",
      passwordHash: await bcrypt.hash("demo1234", 10),
      memberships: { create: { storeId: store.id, role: "OWNER" } },
    },
  });

  // A second login for the other side of the app: she gets the confirmation
  // queue and nothing else. Useful for checking the role boundary by hand.
  await db.user.create({
    data: {
      name: "Salma R.",
      email: "confirmatrice@fatora.ma",
      passwordHash: await bcrypt.hash("demo1234", 10),
      memberships: { create: { storeId: store.id, role: "CONFIRMATRICE" } },
    },
  });

  // --- couriers, with the kind of rates sellers actually negotiate ---------
  const courierSpecs = [
    { name: "Amana", slug: "amana", deliveredFee: 25, returnFee: 15, codPercent: 1 },
    { name: "Ozone Express", slug: "ozone", deliveredFee: 30, returnFee: 20, codPercent: 0 },
    { name: "Cathedis", slug: "cathedis", deliveredFee: 28, returnFee: 18, codPercent: 1.5 },
    { name: "Sendit", slug: "sendit", deliveredFee: 22, returnFee: 12, codPercent: 2 },
  ];

  const couriers = [];
  for (const spec of courierSpecs) {
    const courier = await db.courier.create({
      data: {
        storeId: store.id,
        name: spec.name,
        slug: spec.slug,
        feeRules: {
          create: [
            {
              city: null,
              deliveredFee: spec.deliveredFee,
              returnFee: spec.returnFee,
              codPercent: spec.codPercent,
            },
            // Far-south deliveries cost more — a real per-city rule so the
            // Settings screen and the engine have something true to show.
            {
              city: "Agadir",
              deliveredFee: spec.deliveredFee + 15,
              returnFee: spec.returnFee + 10,
              codPercent: spec.codPercent,
            },
          ],
        },
      },
    });
    couriers.push(courier);
  }

  // --- products, incl. one that looks great and loses money ----------------
  const productSpecs = [
    { sku: "MONTRE-01", name: "Montre homme classique", cost: 85, price: 299, refusalRate: 0.18 },
    { sku: "PARFUM-02", name: "Parfum oriental 50ml", cost: 60, price: 249, refusalRate: 0.22 },
    { sku: "CASQUE-03", name: "Casque Bluetooth", cost: 110, price: 349, refusalRate: 0.15 },
    // The trap: high price, high margin on paper, 40%+ refusals in reality.
    { sku: "ROBOT-04", name: "Robot cuisine multifonction", cost: 480, price: 1290, refusalRate: 0.42 },
    { sku: "CREME-05", name: "Crème visage bio", cost: 45, price: 199, refusalRate: 0.12 },
    { sku: "SNEAK-06", name: "Sneakers running", cost: 150, price: 399, refusalRate: 0.28 },
  ];

  const products = [];
  for (const spec of productSpecs) {
    products.push(
      await db.product.create({
        data: {
          storeId: store.id,
          sku: spec.sku,
          name: spec.name,
          costPrice: spec.cost,
          sellPrice: spec.price,
        },
      }),
    );
  }

  // --- orders --------------------------------------------------------------
  const ORDER_COUNT = 420;
  let reference = 2000;

  type PlannedOrder = {
    id: string;
    status: OrderStatus;
    courierId: string;
    city: string;
    total: number;
    tracking: string;
    ref: string;
    phone: string;
    shippedAt: Date | null;
    orderedAt: Date;
  };
  const planned: PlannedOrder[] = [];

  for (let i = 0; i < ORDER_COUNT; i++) {
    const productIndex = Math.floor(rand() * productSpecs.length);
    const spec = productSpecs[productIndex];
    const product = products[productIndex];
    const courier = pick(couriers);
    const city = pick(CITIES);
    const quantity = rand() < 0.85 ? 1 : 2;
    const total = spec.price * quantity;

    const orderedDaysAgo = randInt(1, 60);
    const orderedAt = daysAgo(orderedDaysAgo);

    // Decide the outcome, respecting each product's refusal rate.
    let status: OrderStatus;
    const roll = rand();
    if (orderedDaysAgo <= 2) {
      status = roll < 0.5 ? "PENDING" : "CONFIRMED";
    } else if (orderedDaysAgo <= 5 && roll < 0.35) {
      status = "IN_TRANSIT";
    } else if (roll < spec.refusalRate) {
      status = rand() < 0.6 ? "REFUSED" : "RETURNED";
    } else if (roll < spec.refusalRate + 0.02) {
      status = "LOST";
    } else {
      status = "DELIVERED";
    }

    // A handful of genuinely stuck parcels for the alerts to find.
    if (i % 47 === 0 && orderedDaysAgo > 12) status = "IN_TRANSIT";

    const shipped = status !== "PENDING" && status !== "CONFIRMED";
    const shippedAt = shipped ? new Date(orderedAt.getTime() + 86400000) : null;
    const deliveredAt =
      status === "DELIVERED" ? new Date(orderedAt.getTime() + 86400000 * randInt(2, 5)) : null;

    const ref = `CMD-${reference++}`;
    const tracking = `${courier.slug.slice(0, 2).toUpperCase()}-${randInt(100000, 999999)}`;

    const order = await db.order.create({
      data: {
        storeId: store.id,
        reference: ref,
        customerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        phone: phone(),
        city,
        courierId: courier.id,
        trackingNumber: shipped ? tracking : null,
        totalAmount: total,
        // These came from a file export, already in flight. confirmationStatus
        // stays null: they were never ours to confirm.
        source: "IMPORT",
        status,
        // Payment state is set by the reconciliation pass below, not guessed
        // here — the whole point is that the courier report decides.
        paymentStatus: "PENDING",
        orderedAt,
        shippedAt,
        deliveredAt,
        items: {
          create: {
            productId: product.id,
            name: spec.name,
            quantity,
            unitPrice: spec.price,
            unitCost: spec.cost,
          },
        },
      },
    });

    planned.push({
      id: order.id,
      status,
      courierId: courier.id,
      city,
      total,
      tracking,
      ref,
      phone: order.phone,
      shippedAt,
      orderedAt,
    });
  }

  console.log(`  ${planned.length} imported orders`);

  // --- manual orders waiting on the confirmation queue ---------------------
  // These are the WhatsApp/DM/phone orders. They start at zero and must be
  // confirmed before anything ships, so they carry a confirmationStatus and
  // have no courier or tracking yet.

  // Reuse a phone that already refused parcels, so the queue's risk warning
  // has a real customer to fire on rather than a contrived one.
  const refusedOrder = planned.find((o) => o.status === "REFUSED");
  const riskyPhone = refusedOrder?.phone ?? phone();
  if (refusedOrder) {
    // Give that number a second refusal so the ratio clears the 50% bar.
    const another = planned.find(
      (o) => o.status === "REFUSED" && o.id !== refusedOrder.id,
    );
    if (another) {
      await db.order.update({ where: { id: another.id }, data: { phone: riskyPhone } });
    }
  }

  const manualSpecs: {
    status: "TO_CONFIRM" | "NO_ANSWER" | "CALLBACK";
    hoursAgo: number;
    attempts: number;
    nextCallInHours?: number;
    phone?: string;
    note?: string;
  }[] = [
    { status: "TO_CONFIRM", hoursAgo: 2, attempts: 0 },
    { status: "TO_CONFIRM", hoursAgo: 5, attempts: 0, note: "Commande via WhatsApp" },
    // The risky one — should show the red "a refusé X colis" banner.
    { status: "TO_CONFIRM", hoursAgo: 8, attempts: 0, phone: riskyPhone },
    { status: "TO_CONFIRM", hoursAgo: 20, attempts: 0, note: "DM Instagram" },
    { status: "NO_ANSWER", hoursAgo: 26, attempts: 1, nextCallInHours: -1 },
    { status: "NO_ANSWER", hoursAgo: 30, attempts: 2, nextCallInHours: -2 },
    // Due in the future: must stay hidden until its time comes.
    { status: "CALLBACK", hoursAgo: 28, attempts: 1, nextCallInHours: 3 },
    { status: "CALLBACK", hoursAgo: 34, attempts: 2, nextCallInHours: 20 },
    { status: "TO_CONFIRM", hoursAgo: 44, attempts: 0 },
    { status: "TO_CONFIRM", hoursAgo: 50, attempts: 0, note: "Appel téléphonique" },
  ];

  for (const spec of manualSpecs) {
    const productIndex = Math.floor(rand() * productSpecs.length);
    const pSpec = productSpecs[productIndex];
    const product = products[productIndex];
    const quantity = rand() < 0.8 ? 1 : 2;
    const orderedAt = new Date(NOW.getTime() - spec.hoursAgo * 3600000);

    const order = await db.order.create({
      data: {
        storeId: store.id,
        reference: `CMD-${reference++}`,
        customerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        phone: spec.phone ?? phone(),
        city: pick(CITIES),
        address: `Rue ${randInt(1, 90)}, Quartier ${pick(["Maarif", "Gauthier", "Hay Riad", "Agdal", "Anfa"])}`,
        totalAmount: pSpec.price * quantity,
        source: "MANUAL",
        // Not shipped, not confirmed: nothing has happened yet.
        status: "PENDING",
        paymentStatus: "PENDING",
        confirmationStatus: spec.status,
        confirmationAttempts: spec.attempts,
        nextCallAt: spec.nextCallInHours
          ? new Date(NOW.getTime() + spec.nextCallInHours * 3600000)
          : null,
        notes: spec.note,
        orderedAt,
        items: {
          create: {
            productId: product.id,
            name: pSpec.name,
            quantity,
            unitPrice: pSpec.price,
            unitCost: pSpec.cost,
          },
        },
      },
    });

    // Past attempts need a matching log, or the owner's per-confirmatrice
    // metrics would disagree with the counter on the order.
    for (let a = 0; a < spec.attempts; a++) {
      await db.confirmationAttempt.create({
        data: {
          orderId: order.id,
          outcome: spec.status === "CALLBACK" ? "CALLBACK" : "NO_ANSWER",
          note: spec.status === "CALLBACK" ? "Client demande un rappel" : "Pas de réponse",
          createdAt: new Date(orderedAt.getTime() + (a + 1) * 3600000),
        },
      });
    }
  }

  console.log(`  ${manualSpecs.length} manual orders in the confirmation queue`);

  // Park the counter above every reference handed out above, or the first
  // manually-created order would collide with a seeded one.
  await db.store.update({
    where: { id: store.id },
    data: { orderCounter: reference },
  });

  // --- courier reports, with deliberate discrepancies ----------------------
  for (const courier of couriers) {
    const mine = planned.filter((o) => o.courierId === courier.id && o.shippedAt);
    if (!mine.length) continue;

    const spec = courierSpecs.find((s) => s.slug === courier.slug)!;

    const batch = await db.importBatch.create({
      data: {
        storeId: store.id,
        type: "COURIER_REPORT",
        courierId: courier.id,
        fileName: `rapport-${courier.slug}-${NOW.toISOString().slice(0, 10)}.xlsx`,
        rowCount: mine.length,
        successCount: mine.length,
        status: "COMPLETED",
      },
    });

    for (const [i, order] of mine.entries()) {
      const feeBase = order.city === "Agadir" ? spec.deliveredFee + 15 : spec.deliveredFee;
      const returnFee = order.city === "Agadir" ? spec.returnFee + 10 : spec.returnFee;
      const codFee = (order.total * spec.codPercent) / 100;
      const expected = Math.round((order.total - feeBase - codFee) * 100) / 100;

      let statusRaw = "En cours de livraison";
      let paidAmount: number | null = null;
      let fee: number | null = null;

      if (order.status === "DELIVERED") {
        statusRaw = pick(["Livré", "LIVRE", "Livrée au client", "Distribué"]);
        fee = Math.round((feeBase + codFee) * 100) / 100;

        // 1 in 12 deliveries is never paid — this is the headline alert.
        if (i % 12 === 0) paidAmount = null;
        // 1 in 17 is underpaid — the mismatch case.
        else if (i % 17 === 0) paidAmount = Math.round((expected - randInt(20, 90)) * 100) / 100;
        else paidAmount = expected;
      } else if (order.status === "RETURNED") {
        statusRaw = pick(["Retourné", "Retour expéditeur", "RETOUR"]);
        fee = returnFee;
      } else if (order.status === "REFUSED") {
        statusRaw = pick(["Refusé par le client", "Retour apres refus client", "REFUSE"]);
        fee = returnFee;
      } else if (order.status === "LOST") {
        statusRaw = "Colis perdu";
      }

      await db.courierReportLine.create({
        data: {
          storeId: store.id,
          batchId: batch.id,
          courierId: courier.id,
          trackingNumber: order.tracking,
          reference: order.ref,
          phone: order.phone,
          statusRaw,
          statusNormalized: order.status,
          codAmount: order.total,
          paidAmount,
          fee,
          reportDate: order.shippedAt
            ? new Date(order.shippedAt.getTime() + 86400000 * 2)
            : NOW,
          orderId: order.id,
          matchedBy: "tracking",
        },
      });

      // Apply the outcome to the order, mirroring what the engine would write.
      if (order.status === "DELIVERED") {
        const paid = paidAmount ?? 0;
        await db.order.update({
          where: { id: order.id },
          data: {
            paymentStatus:
              paidAmount === null ? "PENDING" : paid < expected - 1 ? "PARTIAL" : "PAID",
            amountPaid: paid,
            courierFee: fee ?? 0,
            paidAt: paidAmount === null ? null : new Date(order.orderedAt.getTime() + 86400000 * 6),
          },
        });
      } else if (["RETURNED", "REFUSED", "LOST"].includes(order.status)) {
        await db.order.update({
          where: { id: order.id },
          data: { paymentStatus: "NOT_APPLICABLE", courierFee: fee ?? 0 },
        });
      }
    }

    // One line per courier that matches nothing — the "who is this parcel?" case.
    await db.courierReportLine.create({
      data: {
        storeId: store.id,
        batchId: batch.id,
        courierId: courier.id,
        trackingNumber: `${courier.slug.slice(0, 2).toUpperCase()}-000000`,
        phone: phone(),
        statusRaw: "Livré",
        statusNormalized: "DELIVERED",
        codAmount: randInt(200, 600),
        paidAmount: null,
        reportDate: daysAgo(3),
      },
    });
  }

  // --- discrepancies, derived from what we just wrote ----------------------
  const unpaid = await db.order.findMany({
    where: { storeId: store.id, status: "DELIVERED", paymentStatus: "PENDING" },
    select: { id: true, reference: true, totalAmount: true, courierFee: true },
  });

  for (const o of unpaid) {
    await db.discrepancy.create({
      data: {
        storeId: store.id,
        orderId: o.id,
        type: "DELIVERED_NOT_PAID",
        amount: Number(o.totalAmount) - Number(o.courierFee),
        detail: `${o.reference} — livré selon le courier, aucun versement reçu.`,
      },
    });
  }

  const partial = await db.order.findMany({
    where: { storeId: store.id, paymentStatus: "PARTIAL" },
    select: { id: true, reference: true, totalAmount: true, courierFee: true, amountPaid: true },
  });

  for (const o of partial) {
    const expected = Number(o.totalAmount) - Number(o.courierFee);
    await db.discrepancy.create({
      data: {
        storeId: store.id,
        orderId: o.id,
        type: "AMOUNT_MISMATCH",
        amount: Math.round((expected - Number(o.amountPaid)) * 100) / 100,
        detail: `${o.reference} — attendu ${expected.toFixed(2)} MAD, reçu ${Number(o.amountPaid).toFixed(2)} MAD.`,
      },
    });
  }

  const stuck = await db.order.findMany({
    where: {
      storeId: store.id,
      status: "IN_TRANSIT",
      shippedAt: { lte: new Date(NOW.getTime() - 7 * 86400000) },
    },
    select: { id: true, reference: true, totalAmount: true, shippedAt: true },
  });

  for (const o of stuck) {
    const days = Math.floor((NOW.getTime() - o.shippedAt!.getTime()) / 86400000);
    await db.discrepancy.create({
      data: {
        storeId: store.id,
        orderId: o.id,
        type: "STUCK_IN_TRANSIT",
        amount: o.totalAmount,
        detail: `${o.reference} — en transit depuis ${days} jours.`,
      },
    });
  }

  const orphanLines = await db.courierReportLine.findMany({
    where: { storeId: store.id, orderId: null },
    select: { id: true, trackingNumber: true, codAmount: true },
  });

  for (const line of orphanLines) {
    await db.discrepancy.create({
      data: {
        storeId: store.id,
        reportLineId: line.id,
        type: "UNMATCHED_REPORT_LINE",
        amount: line.codAmount ?? 0,
        detail: `Ligne courier ${line.trackingNumber} sans commande correspondante.`,
      },
    });
  }

  // --- payouts + ad spend --------------------------------------------------
  for (const courier of couriers) {
    for (let w = 1; w <= 6; w++) {
      await db.payout.create({
        data: {
          storeId: store.id,
          courierId: courier.id,
          reference: `VIR-${courier.slug.toUpperCase()}-${w}`,
          amount: randInt(8000, 45000),
          paidAt: daysAgo(w * 7),
        },
      });
    }
  }

  for (let d = 0; d < 60; d++) {
    await db.adSpend.create({
      data: {
        storeId: store.id,
        productId: pick(products).id,
        platform: "facebook",
        date: daysAgo(d),
        amount: randInt(150, 900),
      },
    });
  }

  await db.blacklistedCustomer.createMany({
    data: Array.from({ length: 6 }, () => ({
      storeId: store.id,
      phone: phone(),
      reason: pick([
        "A refusé 3 colis de suite",
        "Ne répond jamais au téléphone",
        "Adresse introuvable",
      ]),
      refusalCount: randInt(2, 5),
    })),
  });

  const [orderCount, discrepancyCount, missing] = await Promise.all([
    db.order.count({ where: { storeId: store.id } }),
    db.discrepancy.count({ where: { storeId: store.id, status: "OPEN" } }),
    db.discrepancy.aggregate({
      where: { storeId: store.id, status: "OPEN", type: "DELIVERED_NOT_PAID" },
      _sum: { amount: true },
    }),
  ]);

  console.log(`
Done.
  store          Zenith Store
  login          demo@fatora.ma / demo1234
  orders         ${orderCount}
  open écarts    ${discrepancyCount}
  missing cash   ${Number(missing._sum.amount ?? 0).toFixed(2)} MAD
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
