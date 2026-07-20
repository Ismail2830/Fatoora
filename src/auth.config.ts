import type { NextAuthConfig } from "next-auth";

/**
 * The edge-safe half of the auth setup.
 *
 * Middleware runs on the edge runtime, where bcrypt and the Postgres driver
 * cannot load. Keeping providers and DB access out of this file lets
 * middleware import it for route protection while the full config in auth.ts
 * (Node runtime only) does the actual credential checking.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    // Runs on every matched request via middleware.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnApp = nextUrl.pathname.startsWith("/app");

      if (isOnApp) return isLoggedIn;

      // Signed-in users have no business on the login/signup screens.
      if (isLoggedIn && ["/login", "/signup"].includes(nextUrl.pathname)) {
        return Response.redirect(new URL("/app", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Cached on the token so every page render doesn't re-query the
        // membership just to know which store to scope to.
        token.storeId = user.storeId;
        token.storeName = user.storeName;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.storeId = token.storeId as string;
        session.user.storeName = token.storeName as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
