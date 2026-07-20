import "server-only";

import { db } from "@/lib/db";
import { round } from "@/lib/money";

export async function getStoreSettings(storeId: string) {
  const store = await db.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { id: true, name: true, stuckAfterDays: true },
  });
  return store;
}

export async function getCourierFeeRules(storeId: string) {
  const couriers = await db.courier.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      feeRules: {
        orderBy: [{ city: "asc" }],
        select: { id: true, city: true, deliveredFee: true, returnFee: true, codPercent: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return couriers.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    active: c.active,
    rules: c.feeRules.map((r) => ({
      id: r.id,
      city: r.city,
      deliveredFee: round(r.deliveredFee).toNumber(),
      returnFee: round(r.returnFee).toNumber(),
      codPercent: round(r.codPercent).toNumber(),
    })),
  }));
}

export async function getTeamMembers(storeId: string) {
  const memberships = await db.membership.findMany({
    where: { storeId },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, name: true, email: true, createdAt: true } },
    },
    orderBy: { role: "asc" },
  });

  return memberships.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    since: m.user.createdAt.toISOString(),
  }));
}
