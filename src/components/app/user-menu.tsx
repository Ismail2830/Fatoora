"use client";

import Link from "next/link";

import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Initials from a display name: "Youssef B." -> "YB". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ name, storeName }: { name: string; storeName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 bg-surface border border-hair rounded-full pl-1.5 pr-3.5 py-1.5 hover:border-hair-strong transition-colors">
          <span className="size-8 rounded-full bg-brand-tint text-brand-dark grid place-items-center text-xs font-bold flex-none">
            {initials(name)}
          </span>
          <span className="text-left hidden sm:block">
            <span className="block text-[13px] font-bold leading-tight">{name}</span>
            <span className="block text-[11px] text-ink-4 leading-tight">{storeName}</span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href="/app/settings">Réglages</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/settings/team">Équipe</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal text-destructive hover:text-destructive"
          >
            Se déconnecter
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
