import { Bell, Search } from "lucide-react";

import { db } from "@/lib/db";
import { canSeeMoney, requireSession } from "@/lib/session";
import { getQueueCounts } from "@/lib/queries/confirmation";
import { Logo } from "@/components/brand/logo";
import { AddMenu } from "@/components/app/add-menu";
import { SidebarNav, type NavItem } from "@/components/app/sidebar-nav";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { storeId, storeName, name, role } = session;
  const fullAccess = canSeeMoney(role);

  const [openDiscrepancies, queue] = await Promise.all([
    fullAccess ? db.discrepancy.count({ where: { storeId, status: "OPEN" } }) : 0,
    getQueueCounts(storeId),
  ]);

  // The nav a confirmatrice sees is her whole job: the queue and new orders.
  // The pages themselves also guard — see requireMoneyAccess — because a
  // hidden link is decoration, not a permission.
  const nav: NavItem[] = fullAccess
    ? [
        { href: "/app", label: "Dashboard" },
        { href: "/app/confirmation", label: "À confirmer", badge: queue.due },
        { href: "/app/orders", label: "Commandes" },
        { href: "/app/import", label: "Import" },
        { href: "/app/reconciliation", label: "Réconciliation", badge: openDiscrepancies },
        { href: "/app/products", label: "Produits" },
        { href: "/app/couriers", label: "Couriers" },
        { href: "/app/analytics", label: "Analytics" },
        { href: "/app/settings", label: "Réglages" },
      ]
    : [
        // Manual order entry (/app/orders/new) belongs here too, once it exists.
        { href: "/app/confirmation", label: "À confirmer", badge: queue.due },
      ];

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="w-[238px] flex-none bg-surface border-r border-hair p-4 pt-[22px] hidden md:flex flex-col sticky top-0 h-screen">
        <div className="px-2 pb-5">
          <Logo size="sm" href={fullAccess ? "/app" : "/app/confirmation"} />
        </div>

        <SidebarNav items={nav} />

        {/* Billing is the owner's business, not the confirmatrice's. */}
        {fullAccess && (
          <div className="rounded-[14px] bg-brand-tint p-4 mt-4">
            <p className="text-[13px] font-bold text-brand-dark">Essai · 11 jours restants</p>
            <p className="text-xs text-ink-3 mt-1 leading-snug">
              Passe au plan Pro pour continuer.
            </p>
            <Button size="sm" className="w-full mt-3">
              Upgrade
            </Button>
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center gap-3 p-4 sticky top-0 z-10 bg-canvas/80 backdrop-blur">
          <label className="flex-1 max-w-[380px] relative">
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <span className="sr-only">Chercher une commande</span>
            <input
              name="q"
              placeholder="Chercher par téléphone, tracking ou n° commande…"
              className="w-full h-11 pl-10 pr-4 rounded-[14px] bg-surface border border-hair text-sm placeholder:text-ink-4 outline-none focus:border-brand/40 focus:ring-3 focus:ring-brand/10"
            />
          </label>

          <div className="flex-1" />

          {/* Orders arrive by WhatsApp at random moments, from whatever screen
              you happen to be on — so this lives in the topbar, not on
              Commandes. Importing is the confirmatrice's business only if she
              can see files; she can't. */}
          <AddMenu canImport={fullAccess} />

          <Button variant="outline" size="pill" className="hidden lg:inline-flex">
            📅 Ce mois-ci
          </Button>

          <Button variant="outline" size="icon-lg" className="rounded-full relative" aria-label="Notifications">
            <Bell className="size-4" />
            {openDiscrepancies > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-bad" />
            )}
          </Button>

          <UserMenu name={name ?? "Vendeur"} storeName={storeName} />
        </header>

        <main className="flex-1 px-4 pb-8 md:px-6">{children}</main>
      </div>
    </div>
  );
}
