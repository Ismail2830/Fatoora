"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MemberRole } from "@/generated/prisma/enums";
import { addTeamMember, removeMember, updateMemberRole } from "./actions";

type Member = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
};

const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Admin",
  CONFIRMATRICE: "Confirmatrice",
};

export function TeamSection({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-hair border border-hair rounded-xl">
        {members.map((m) => (
          <MemberRow key={m.membershipId} member={m} isSelf={m.userId === currentUserId} />
        ))}
      </ul>

      <AddMemberDialog />
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function changeRole(role: MemberRole) {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(member.membershipId, role);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeMember(member.membershipId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold truncate">
          {member.name} {isSelf && <span className="text-ink-4 font-normal">(toi)</span>}
        </p>
        <p className="text-xs text-ink-4 truncate">{member.email}</p>
        {error && <p className="text-xs text-bad-ink mt-1">{error}</p>}
      </div>

      <div className="flex items-center gap-2 flex-none">
        {isSelf ? (
          <Badge variant="brand">{ROLE_LABEL[member.role]}</Badge>
        ) : (
          <select
            value={member.role}
            onChange={(e) => changeRole(e.target.value as MemberRole)}
            disabled={pending}
            className="h-8 px-2 rounded-md bg-surface border border-input text-[12.5px]"
          >
            {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        )}

        {!isSelf &&
          (confirming ? (
            <div className="flex items-center gap-1">
              <Button size="xs" variant="destructive" disabled={pending} onClick={remove}>
                Retirer
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                Non
              </Button>
            </div>
          ) : (
            <Button size="icon-sm" variant="ghost" aria-label="Retirer" onClick={() => setConfirming(true)}>
              <Trash2 className="size-3.5" />
            </Button>
          ))}
      </div>
    </li>
  );
}

function AddMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addTeamMember(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="pill" variant="outline">
          <Plus className="size-4" /> Ajouter un membre
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau membre</DialogTitle>
          <DialogDescription>
            Tu crées son compte et son mot de passe — partage-le-lui en direct.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="member-name">Nom</Label>
            <Input id="member-name" name="name" placeholder="Salma R." required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-password">Mot de passe</Label>
            <Input id="member-password" name="password" type="password" minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">Rôle</Label>
            <select
              id="member-role"
              name="role"
              defaultValue="CONFIRMATRICE"
              className="w-full h-9 px-3 rounded-md bg-surface border border-input text-sm"
            >
              <option value="CONFIRMATRICE">Confirmatrice — file de confirmation uniquement</option>
              <option value="ADMIN">Admin — accès complet</option>
              <option value="OWNER">Propriétaire</option>
            </select>
          </div>

          {error && <p className="text-[13px] text-bad-ink">{error}</p>}

          <Button type="submit" size="pill" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer le compte"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
