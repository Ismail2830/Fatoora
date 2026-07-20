import Link from "next/link";
import type { Metadata } from "next";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Créer un compte — Fatora" };

export default function SignupPage() {
  return (
    <>
      <h1 className="display text-[38px] leading-tight mb-2">Commence gratuitement</h1>
      <p className="text-[15px] text-ink-3 mb-8">
        14 jours d&apos;essai, sans carte bancaire.
      </p>

      <SignupForm />

      <p className="text-sm text-ink-3 mt-8">
        Tu as déjà un compte ?{" "}
        <Link href="/login" className="font-semibold text-brand hover:text-brand-dark">
          Se connecter
        </Link>
      </p>
    </>
  );
}
