/**
 * Order constants shared by server queries and client components.
 *
 * Deliberately free of "server-only" and of any db import. The tab bar and the
 * paginator are client components, and importing these from the query module
 * would pull Prisma into the browser bundle — which fails the build rather
 * than degrading quietly, but only once the page is actually rendered.
 */

export const ORDER_TABS = [
  { id: "toutes", label: "Toutes" },
  { id: "a_confirmer", label: "À confirmer" },
  { id: "a_expedier", label: "À expédier" },
  { id: "en_transit", label: "En transit" },
  { id: "livrees", label: "Livrées" },
  { id: "impayees", label: "Livrées, pas payées" },
  { id: "retours", label: "Retours/Refus" },
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]["id"];

export const PAGE_SIZE = 25;

export function isOrderTab(value: string | undefined): value is OrderTab {
  return ORDER_TABS.some((t) => t.id === value);
}
