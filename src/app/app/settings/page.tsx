import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import { getCourierFeeRules, getStoreSettings, getTeamMembers } from "@/lib/queries/settings";
import { StoreSettingsForm } from "./store-settings-form";
import { CourierFees } from "./courier-fees";
import { TeamSection } from "./team-section";

export const metadata: Metadata = { title: "Réglages — Fatora" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireMoneyAccess();

  const [store, couriers, team] = await Promise.all([
    getStoreSettings(session.storeId),
    getCourierFeeRules(session.storeId),
    getTeamMembers(session.storeId),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="display text-[34px] leading-tight">Réglages</h1>
        <p className="text-[14.5px] text-ink-3">Boutique, tarifs couriers, équipe.</p>
      </header>

      <Section title="Boutique">
        <StoreSettingsForm store={store} />
      </Section>

      <Section
        title="Tarifs couriers"
        sub="Chaque courier a ses propres frais — ceux que tu as négociés. Une ville non listée utilise le tarif par défaut."
      >
        <CourierFees couriers={couriers} />
      </Section>

      <Section
        title="Équipe"
        sub="Une confirmatrice voit uniquement la file de confirmation — jamais les marges ni la facturation."
      >
        <TeamSection members={team} currentUserId={session.userId} />
      </Section>

      <Section title="Abonnement">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Essai — 11 jours restants</p>
            <p className="text-xs text-ink-4 mt-0.5">
              299 MAD/mois après l&apos;essai. Commandes illimitées, tous les couriers.
            </p>
          </div>
          {/* Decorative for now — no payment integration wired up yet. */}
          <button className="bg-night text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
            Upgrade
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-hair rounded-[18px] p-5">
      <div className="mb-4">
        <p className="font-bold text-[16px]">{title}</p>
        {sub && <p className="text-[13px] text-ink-3 mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
