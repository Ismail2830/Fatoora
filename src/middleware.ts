import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Only the edge-safe config — no DB, no bcrypt. The `authorized` callback in
// auth.config.ts decides what's protected.
export default NextAuth(authConfig).auth;

export const config = {
  // Everything except Next internals, the auth API, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
