import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireMoneyAccess } from "@/lib/session";
import { getTeamMembers } from "@/lib/queries/settings";
import { TeamSection } from "../team-section";

export const metadata: Metadata = { title: "Équipe — Fatora" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requireMoneyAccess();
  const team = await getTeamMembers(session.storeId);

  return (
    <div className="max-w-3xl space-y-4">
      <header>
        <Link
          href="/app/settings"
          className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink-1 mb-2"
        >
          <ArrowLeft className="size-3.5" /> Réglages
        </Link>
        <h1 className="display text-[34px] leading-tight">Équipe</h1>
        <p className="text-[14.5px] text-ink-3">
          Une confirmatrice voit uniquement la file de confirmation — jamais les marges ni la
          facturation.
        </p>
      </header>

      <section className="bg-surface border border-hair rounded-[18px] p-5">
        <TeamSection members={team} currentUserId={session.userId} />
      </section>
    </div>
  );
}
