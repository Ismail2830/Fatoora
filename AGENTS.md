<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Fatora — gotchas worth knowing before you debug

## After any `prisma generate`, restart the dev server

Turbopack caches the generated client, so a running server keeps the old one.
The symptom is a runtime error naming a column you just added
(`Unknown argument 'orderCounter'`) while `tsc` passes — because TypeScript
reads the new client from disk and the server doesn't. Also note Next 16 will
not run two dev servers from one directory; kill the first.

## `server-only` modules must not be imported by client components

`tsc` and eslint both miss this — it only fails when the page renders, and it
takes the whole route down (a Prisma import into the browser bundle). Anything
a `"use client"` file needs must live in a module with no `server-only` and no
`db` import. See `src/lib/orders-shared.ts`, which exists purely for this.

## Money

All amounts are `Decimal(12,2)`, never Float. Do math with `src/lib/money.ts`.
Decimals are **not** serialisable across the server/client boundary — convert
with `toNumber()` in the server component or action that hands them over.

## Phone numbers are a match key

Stored normalized to 9 digits (`612345678`), never `06…`. Every writer must
agree or reconciliation silently stops matching. Display via `formatPhone()`.

## Don't read the clock while rendering

Server and client disagree, which is a hydration mismatch. Compute ages and
"is it late" in the query layer and pass numbers down. See
`getOrders`/`ageOf` in `src/lib/queries/orders.ts`.

## Roles are enforced in queries, not in the nav

A `CONFIRMATRICE` must never reach profit, fees, payouts or billing. Every
money page calls `requireMoneyAccess()` from `src/lib/session.ts`. Hiding a
sidebar link is decoration, not a permission.

## Tests

`npm test` runs the pure logic (reconciliation engine, parsers, money). Those
modules are deliberately free of I/O so the money rules stay provable —
keep them that way.
