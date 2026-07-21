import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Only the edge-safe config — no DB, no bcrypt. The `authorized` callback in
// auth.config.ts decides what's protected.
//
// Named `proxy.ts`, not `middleware.ts`: this Next version has fully retired
// the middleware convention in favor of proxy (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Keeping the old filename didn't just print a deprecation warning here — it
// silently broke routing for every page (auth pages and /app/* both 404'd)
// while API routes and the redirect-only cases kept working. Route by file
// name, not by a warning's severity.
export default NextAuth(authConfig).auth;

export const config = {
  // Everything except Next internals, the auth API, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
