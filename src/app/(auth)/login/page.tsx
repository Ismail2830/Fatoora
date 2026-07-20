import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Se connecter — Fatora" };

export default function LoginPage() {
  return (
    <>
      <h1 className="display text-[38px] leading-tight mb-2">Bon retour</h1>
      <p className="text-[15px] text-ink-3 mb-8">
        Connecte-toi pour voir où en est ton cash.
      </p>

      <LoginForm />

      <p className="text-sm text-ink-3 mt-8">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:text-brand-dark">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
