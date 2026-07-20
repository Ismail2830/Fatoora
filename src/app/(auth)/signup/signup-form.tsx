"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="pill" className="w-full" disabled={pending}>
      {pending ? "Création…" : "Créer mon compte"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Ton nom</Label>
        <Input id="name" name="name" autoComplete="name" placeholder="Youssef B." required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="storeName">Nom de ta boutique</Label>
        <Input
          id="storeName"
          name="storeName"
          autoComplete="organization"
          placeholder="Zenith Store"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="youssef@zenithstore.ma"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-ink-4">8 caractères minimum.</p>
      </div>

      <SubmitButton />
    </form>
  );
}
