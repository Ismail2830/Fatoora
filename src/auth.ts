import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "./auth.config";
import { db } from "./lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            memberships: {
              include: { store: true },
              orderBy: { role: "asc" },
              take: 1,
            },
          },
        });

        // Compare against a dummy hash when the user doesn't exist, so a
        // missing account and a wrong password take the same time to answer.
        // Otherwise the response time tells an attacker which emails are real.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok) return null;

        const membership = user.memberships[0];
        if (!membership) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          storeId: membership.storeId,
          storeName: membership.store.name,
          role: membership.role,
        };
      },
    }),
  ],
});

// bcrypt hash of a value nobody can supply; only ever used to burn the same
// CPU time as a real comparison.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
