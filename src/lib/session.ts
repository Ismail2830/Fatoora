import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { MemberRole } from "@/generated/prisma/enums";

export type AppSession = {
  userId: string;
  name: string;
  storeId: string;
  storeName: string;
  role: MemberRole;
};

/**
 * The session every /app page must start from.
 *
 * Middleware already blocks anonymous requests, but a page must never rely on
 * that alone: middleware can be misconfigured, and this is also what narrows
 * storeId to a non-null string for the queries below.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();

  if (!session?.user?.storeId) redirect("/login");

  return {
    userId: session.user.id,
    name: session.user.name ?? "Vendeur",
    storeId: session.user.storeId,
    storeName: session.user.storeName,
    role: session.user.role as MemberRole,
  };
}

/**
 * A confirmatrice confirms orders. She must never see cost prices, margins,
 * reconciliation, payouts or billing — she is often an external contractor.
 *
 * This is the real boundary. Hiding sidebar links is decoration: without this
 * check, anyone who types /app/products reads the margins.
 */
export function canSeeMoney(role: MemberRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Guard for every page that shows profit, fees, payouts or billing. */
export async function requireMoneyAccess(): Promise<AppSession> {
  const session = await requireSession();

  if (!canSeeMoney(session.role)) {
    // Send her somewhere she's allowed to be rather than showing a dead end.
    redirect("/app/confirmation");
  }

  return session;
}

/** True when this role's home screen is the confirmation queue, not the dashboard. */
export function homePathFor(role: MemberRole): string {
  return canSeeMoney(role) ? "/app" : "/app/confirmation";
}
