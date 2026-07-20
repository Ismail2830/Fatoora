"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireMoneyAccess } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------- store

const storeSchema = z.object({
  name: z.string().trim().min(2, "Nom requis."),
  stuckAfterDays: z.coerce.number().int().min(1).max(60),
});

export async function updateStoreSettings(formData: FormData): Promise<ActionResult> {
  const session = await requireMoneyAccess();
  const parsed = storeSchema.safeParse({
    name: formData.get("name"),
    stuckAfterDays: formData.get("stuckAfterDays"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db.store.update({ where: { id: session.storeId }, data: parsed.data });
  revalidatePath("/app/settings");
  return { ok: true };
}

// ---------------------------------------------------------------- courier fees

const feeRuleSchema = z.object({
  courierId: z.string().min(1),
  city: z.string().trim().optional(),
  deliveredFee: z.coerce.number().min(0),
  returnFee: z.coerce.number().min(0),
  codPercent: z.coerce.number().min(0).max(100),
});

/**
 * Every seller negotiates their own rates, so this is the one form that
 * feeds directly into the reconciliation engine's money math — a typo here
 * silently changes every future "missing cash" number for that courier.
 */
export async function upsertFeeRule(formData: FormData): Promise<ActionResult> {
  const session = await requireMoneyAccess();
  const parsed = feeRuleSchema.safeParse({
    courierId: formData.get("courierId"),
    city: formData.get("city") || undefined,
    deliveredFee: formData.get("deliveredFee"),
    returnFee: formData.get("returnFee"),
    codPercent: formData.get("codPercent"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const courier = await db.courier.findFirst({
    where: { id: parsed.data.courierId, storeId: session.storeId },
    select: { id: true },
  });
  if (!courier) return { ok: false, error: "Courier introuvable." };

  const city = parsed.data.city ?? null;

  // Not upsert(): Prisma's compound-unique `where` shape requires city to be
  // a non-null string, even though the column itself is nullable — so it has
  // no way to target the default rule (city: null). Find-then-write instead.
  const existing = await db.courierFeeRule.findFirst({
    where: { courierId: courier.id, city },
    select: { id: true },
  });

  const data = {
    deliveredFee: parsed.data.deliveredFee,
    returnFee: parsed.data.returnFee,
    codPercent: parsed.data.codPercent,
  };

  if (existing) {
    await db.courierFeeRule.update({ where: { id: existing.id }, data });
  } else {
    await db.courierFeeRule.create({ data: { courierId: courier.id, city, ...data } });
  }

  revalidatePath("/app/settings");
  return { ok: true };
}

export async function deleteFeeRule(ruleId: string): Promise<ActionResult> {
  const session = await requireMoneyAccess();
  const rule = await db.courierFeeRule.findFirst({
    where: { id: ruleId, courier: { storeId: session.storeId } },
    select: { id: true, city: true },
  });
  if (!rule) return { ok: false, error: "Règle introuvable." };
  // The default rule (city null) is the fallback resolveFeeRule() falls back
  // to when no per-city rule matches — deleting it would leave a courier
  // with no fee at all rather than a sensible default.
  if (rule.city === null) {
    return { ok: false, error: "Impossible de supprimer le tarif par défaut." };
  }

  await db.courierFeeRule.delete({ where: { id: rule.id } });
  revalidatePath("/app/settings");
  return { ok: true };
}

// ---------------------------------------------------------------- team

const addMemberSchema = z.object({
  name: z.string().trim().min(2, "Nom requis."),
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(8, "8 caractères minimum."),
  role: z.enum(["OWNER", "ADMIN", "CONFIRMATRICE"]),
});

export async function addTeamMember(formData: FormData): Promise<ActionResult> {
  const session = await requireMoneyAccess();
  const parsed = addMemberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // User.email is unique across the whole app, not per store — a hit here
    // is somebody else's account. Attaching it to this store without their
    // consent would be a real security hole, so this always errors rather
    // than silently joining them.
    return { ok: false, error: "Un compte existe déjà avec cet email." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await db.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      memberships: { create: { storeId: session.storeId, role: parsed.data.role } },
    },
  });

  revalidatePath("/app/settings");
  return { ok: true };
}

async function ownerCount(storeId: string): Promise<number> {
  return db.membership.count({ where: { storeId, role: "OWNER" } });
}

export async function updateMemberRole(
  membershipId: string,
  role: "OWNER" | "ADMIN" | "CONFIRMATRICE",
): Promise<ActionResult> {
  const session = await requireMoneyAccess();
  const membership = await db.membership.findFirst({
    where: { id: membershipId, storeId: session.storeId },
    select: { id: true, userId: true, role: true },
  });
  if (!membership) return { ok: false, error: "Membre introuvable." };

  if (membership.userId === session.userId) {
    return { ok: false, error: "Tu ne peux pas changer ton propre rôle." };
  }
  if (membership.role === "OWNER" && role !== "OWNER" && (await ownerCount(session.storeId)) <= 1) {
    return { ok: false, error: "Il doit rester au moins un propriétaire." };
  }

  await db.membership.update({ where: { id: membership.id }, data: { role } });
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function removeMember(membershipId: string): Promise<ActionResult> {
  const session = await requireMoneyAccess();
  const membership = await db.membership.findFirst({
    where: { id: membershipId, storeId: session.storeId },
    select: { id: true, userId: true, role: true },
  });
  if (!membership) return { ok: false, error: "Membre introuvable." };

  if (membership.userId === session.userId) {
    return { ok: false, error: "Tu ne peux pas te retirer toi-même." };
  }
  if (membership.role === "OWNER" && (await ownerCount(session.storeId)) <= 1) {
    return { ok: false, error: "Il doit rester au moins un propriétaire." };
  }

  await db.membership.delete({ where: { id: membership.id } });
  revalidatePath("/app/settings");
  return { ok: true };
}
