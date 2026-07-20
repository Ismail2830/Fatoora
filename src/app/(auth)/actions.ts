"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { COURIER_PROFILES } from "@/lib/import/couriers";

export type AuthFormState = { error?: string } | undefined;

const loginSchema = z.object({
  email: z.string().email("Email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/app" });
  } catch (error) {
    if (error instanceof AuthError) {
      // Never distinguish "no such account" from "wrong password" — that would
      // turn the login form into an account-enumeration oracle.
      return { error: "Email ou mot de passe incorrect." };
    }
    // signIn throws a redirect on success; it must reach Next untouched.
    throw error;
  }
}

const signupSchema = z.object({
  name: z.string().min(2, "Ton nom, s'il te plaît."),
  storeName: z.string().min(2, "Le nom de ta boutique, s'il te plaît."),
  email: z.string().email("Email invalide."),
  password: z.string().min(8, "8 caractères minimum."),
});

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    storeName: formData.get("storeName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, storeName, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet email." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const store = await tx.store.create({ data: { name: storeName } });

    await tx.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        memberships: { create: { storeId: store.id, role: "OWNER" } },
      },
    });

    // Seed the couriers everyone uses, with zeroed fees. A new seller lands on
    // an app that already knows their couriers; Settings is where they enter
    // the rates they personally negotiated.
    await tx.courier.createMany({
      data: COURIER_PROFILES.filter((p) => p.slug !== "generic").map((p) => ({
        storeId: store.id,
        name: p.name,
        slug: p.slug,
      })),
    });
  });

  await signIn("credentials", { email: normalizedEmail, password, redirectTo: "/app" });
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
