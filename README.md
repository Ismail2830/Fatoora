<div align="center">

# Fatora

**Cash-on-delivery reconciliation for Moroccan e-commerce sellers.**

Fatora matches courier delivery reports against your orders automatically — so you know your real profit the day a parcel is delivered, not weeks later when the courier finally pays out.

</div>

---

## The problem

Most COD sellers in Morocco run their business on WhatsApp, Excel, and whatever the courier's PDF says. Couriers deliver, hold the cash, and pay out later in bulk — and their reports don't always match reality: an order marked "delivered" that was never paid, a return fee charged twice, a parcel that's been "in transit" for three weeks. Nobody catches it until the seller manually cross-checks a spreadsheet, if they ever do.

Fatora automates that cross-check. Import your orders and your courier's report, and it tells you exactly where every dirham is — delivered and paid, delivered but still owed, returned, lost — instead of a spreadsheet full of hope.

## Screenshots

<!--
  Drop screenshots into docs/screenshots/ and reference them below, e.g.:
  ![Dashboard](docs/screenshots/dashboard.png)
-->

| Landing page | Dashboard |
| --- | --- |
| <img width="1918" height="944" alt="fatora 1" src="https://github.com/user-attachments/assets/1955d9d3-6d6a-441d-be00-f69c44db546e" />
 |<img width="1917" height="942" alt="fatora dashboard" src="https://github.com/user-attachments/assets/e78c2d6f-b05f-4ea4-8772-8ff03b87c090" />
 |

| Order import (WhatsApp paste) | Orders list |
| --- | --- |
| <img width="1917" height="944" alt="fatora commandes" src="https://github.com/user-attachments/assets/c49690c3-313a-4733-9445-40bbe7e79252" />
 | <img width="1919" height="945" alt="fatora 4" src="https://github.com/user-attachments/assets/5d092043-2a67-40a2-8630-cb8323a2ff0a" />
|

| Analytics | Login |
| --- | --- |
| <img width="1919" height="945" alt="fatora analytics" src="https://github.com/user-attachments/assets/a7d219e1-f91f-469c-8627-154b007e4316" />
 | <img width="1917" height="946" alt="fatora 2" src="https://github.com/user-attachments/assets/dba889ff-3497-440b-837d-3455f809509c" /> |

## Features

- **Order import** — Shopify, WooCommerce, Google Sheets/CSV, or manual entry with WhatsApp-message paste-and-parse (Darija-aware).
- **Courier report import** — dedicated parsers per courier (Amana, Ozone Express, Cathedis, Sendit), each with its own column layout and quirks.
- **Auto-reconciliation engine** — matches report lines to orders and raises a discrepancy the moment a courier's claim and the seller's books disagree (paid-not-delivered, delivered-not-paid, amount mismatch, lost parcel, stale in-transit).
- **Real profit dashboard** — cash still in transit with couriers, cash collected this month, delivery rate, and the biggest open money gaps, all live.
- **Paid-on-delivery flow** — assigning a courier shows the expected delivery window and cost for that city before you commit; delivery confirmation and payment recording are separate, explicit steps so a manual "delivered" claim never gets silently treated as "paid."
- **Analytics** — return rate by city, delivery rate by courier, collected-vs-expected over time, exportable to CSV.
- **Team roles** — Owner/Admin see money; a Confirmatrice only sees her confirmation queue — enforced in every query, not just hidden in the sidebar.
- **Reconciliation queue** — every open discrepancy, prioritized by amount, one click from resolution.

## Tech stack

| | |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript |
| Database | PostgreSQL via [Neon](https://neon.tech), [Prisma 7](https://www.prisma.io) |
| Auth | [Auth.js v5](https://authjs.dev) (Credentials provider, bcrypt) |
| UI | [shadcn/ui](https://ui.shadcn.com) (Radix primitives), Tailwind CSS v4 |
| Charts | [Recharts](https://recharts.org) |
| Parsing | [Papaparse](https://www.papaparse.com) (CSV), [xlsx](https://github.com/SheetJS/sheetjs) (courier report spreadsheets), [Zod](https://zod.dev) |

## Getting started

**Prerequisites:** Node 20+, a [Neon](https://neon.tech) Postgres project (or any Postgres instance).

```bash
git clone https://github.com/Ismail2830/Fatoora.git
cd Fatoora
npm install
```

Copy the env template and fill in your own values:

```bash
cp .env.example .env
```

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | Pooled Neon connection string — used by the app at runtime |
| `DIRECT_URL` | Direct (non-pooled) connection string — required by Prisma Migrate |
| `AUTH_SECRET` | Session encryption key — generate with `npx auth secret` |
| `AUTH_URL` | Canonical app URL, read automatically by Auth.js for redirects |
| `NEXT_PUBLIC_APP_URL` | Same URL, exposed to the client |

Set up the database and seed realistic demo data:

```bash
npm run db:push
npm run db:seed
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** after any `prisma generate` (including the first install), restart the dev server — Turbopack caches the previously generated client and won't pick up schema changes on its own.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the pure-logic test suite (reconciliation engine, parsers, money math) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run db:push` | Push the schema without a migration (fast local iteration) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |

## Deployment

Deployed on [Vercel](https://vercel.com), building straight from `master`. The Prisma client is generated into a gitignored folder, so `postinstall: prisma generate` regenerates it on every install — without that step, a fresh clone (including Vercel's) fails to build.

## License

Private project — all rights reserved.
