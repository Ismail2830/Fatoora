import type { DefaultSession } from "next-auth";

/**
 * Every query in this app is scoped by storeId, so the session carries it.
 * Without this augmentation, session.user.storeId would not typecheck.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      storeId: string;
      storeName: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    storeId: string;
    storeName: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    storeId: string;
    storeName: string;
    role: string;
  }
}
