import Link from "next/link";
import type { Metadata } from "next";

import { PricingSection } from "./pricing-section";

export const metadata: Metadata = {
  title: "Fatora — Gère ton cash COD plus malin",
  description:
    "Importe tes commandes et les rapports couriers. Fatora réconcilie tout, détecte les écarts et t'affiche exactement combien de flous te manque.",
};

/**
 * Landing page, cloned from the bundled Khalas.html reference (Desktop).
 *
 * A different design from the earlier Khalas.dc.html: sky-gradient hero with a
 * floating glass nav, a browser-chrome product mockup, about statement, logo
 * cloud, 3 steps, a 2×2 feature grid whose cards each carry a mini-mockup, a
 * split section with a cash-flow chart, real 3-tier pricing with a
 * monthly/yearly toggle, and a dark footer CTA. Structure, palette, copy and
 * pixel values follow the reference; responsive stacking is added because the
 * reference is a fixed-width desktop mockup.
 */

const LOGOS = ["Shopify", "WooCommerce", "Google Sheets", "Amana", "Ozone", "Sendit"];

const STEPS = [
  {
    n: "01",
    title: "Importe tes commandes",
    desc: "Upload ton CSV/Excel depuis Shopify, WooCommerce ou Google Sheets. Le mapping des colonnes se fait tout seul.",
  },
  {
    n: "02",
    title: "Ajoute les rapports couriers",
    desc: "Balance les fichiers d'Amana, Ozone, Cathedis ou Sendit — chaque format messy est parsé automatiquement.",
  },
  {
    n: "03",
    title: "Vois ton vrai cash",
    desc: "Fatora réconcilie, détecte les écarts et t'affiche exactement combien de flous te manque. Safi.",
  },
];

const NEED_LIST = [
  {
    title: "Réconciliation en temps réel",
    desc: "Chaque ligne courier croisée avec ta commande, en direct.",
  },
  {
    title: "Suivi de profit intelligent",
    desc: "Profit réel par produit après retours, frais COD et pub.",
  },
  {
    title: "Alertes d'écart automatiques",
    desc: "« Livré mais pas payé » signalé avant que tu perdes le fil.",
  },
  {
    title: "Multi-courier natif",
    desc: "Amana, Ozone, Cathedis, Sendit — tous au même endroit.",
  },
];

/** The reconciliation rows inside the hero mockup — the pitch, demonstrated. */
const MOCKUP_ROWS = [
  {
    id: "CMD-2198",
    label: "Livré, pas de versement",
    dot: "#d1495b",
    courier: "Ozone",
    amount: "450 MAD",
    amountColor: "#d1495b",
  },
  {
    id: "CMD-2231",
    label: "Matché · payé",
    dot: "#1f9d63",
    courier: "Amana",
    amount: "320 MAD",
    amountColor: "#1f9d63",
  },
  {
    id: "CMD-2176",
    label: "En transit trop long · 9j",
    dot: "#d9822b",
    courier: "Sendit",
    amount: "390 MAD",
    amountColor: "#d9822b",
  },
];

/** Section eyebrow: purple dot + label, as the reference draws it. */
function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-[13px] font-semibold text-brand mb-3.5 ${className}`}
    >
      <span className="size-1.5 rounded-full bg-brand" />
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div>
      {/* HERO with sky gradient */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(175deg,#e7e0fb 0%,#eae6fb 22%,#eef0fd 46%,#e2effb 68%,#eceaf2 100%)",
        }}
      >
        <div
          aria-hidden
          className="absolute -top-20 left-[8%] w-[320px] h-[220px]"
          style={{
            background: "radial-gradient(ellipse,rgba(255,255,255,.85),transparent 70%)",
            filter: "blur(10px)",
          }}
        />
        <div
          aria-hidden
          className="absolute top-10 right-[12%] w-[300px] h-[200px]"
          style={{
            background: "radial-gradient(ellipse,rgba(202,225,255,.7),transparent 70%)",
            filter: "blur(12px)",
          }}
        />

        <div className="relative mx-auto max-w-[1180px] px-5 sm:px-8 pt-[18px]">
          {/* floating nav pill */}
          <header
            className="flex items-center justify-between gap-5 rounded-2xl border py-[11px] pr-3 pl-[18px]"
            style={{
              background: "rgba(255,255,255,.72)",
              backdropFilter: "blur(12px)",
              borderColor: "rgba(255,255,255,.9)",
              boxShadow: "0 12px 34px -20px rgba(60,40,120,.5)",
            }}
          >
            <div className="flex items-center gap-[9px]">
              <span className="grid size-[30px] place-items-center rounded-lg bg-night">
                <span
                  className="size-3 rounded-full"
                  style={{ background: "linear-gradient(135deg,#c9bafb,#8b6ff0)" }}
                />
              </span>
              <span className="display text-[23px] tracking-[.4px]">Fatora</span>
            </div>

            <nav className="hidden md:flex items-center gap-[26px] text-sm font-medium text-ink-2">
              {/* Anchors only for sections that exist on this page — the
                  reference nav also lists Témoignages and Blog, but ships no
                  such sections, and a dead link is worse than a shorter nav. */}
              <a href="#fonctionnalites" className="hover:text-ink transition-colors">
                Fonctionnalités
              </a>
              <a href="#comment" className="hover:text-ink transition-colors">
                Comment ça marche
              </a>
              <a href="#tarifs" className="hover:text-ink transition-colors">
                Tarifs
              </a>
            </nav>

            <div className="flex items-center gap-4">
              {/* Not in the reference (its mockup has no auth), but a landing
                  page without a way back in locks every existing user out. */}
              <Link
                href="/login"
                className="text-sm font-medium text-ink-2 hover:text-ink transition-colors"
              >
                Se connecter
              </Link>
              <Link
                href="/signup"
                className="rounded-[11px] bg-night px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-night-2 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </header>

          {/* hero center */}
          <div className="mx-auto max-w-[820px] pt-[52px] pb-[26px] text-center">
            <div
              className="mb-[26px] inline-flex items-center gap-[9px] rounded-full border p-1.5 pr-3 text-[13px] font-medium text-ink-2"
              style={{ background: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.9)" }}
            >
              <span className="rounded-full bg-night px-[9px] py-[3px] text-[11px] font-bold text-white">
                NEW
              </span>
              La réconciliation COD, enfin automatique 🇲🇦
            </div>

            {/* Jakarta bold headline with a serif italic purple accent — the
                inverse of the older landing, where the whole H1 was serif. */}
            <h1 className="mb-[22px] font-sans text-[40px] sm:text-[52px] lg:text-[62px] font-bold leading-[1.04] tracking-[-1px] text-ink">
              Gère ton cash COD{" "}
              <em className="display italic font-normal text-brand">plus malin,</em>
              <br className="hidden sm:block" /> propulsé par de vraies données
            </h1>

            <p className="mx-auto mb-8 max-w-[560px] text-[17px] sm:text-lg leading-[1.55] text-ink-3">
              Importe tes commandes et les rapports couriers. Fatora réconcilie tout, détecte
              les écarts et t&apos;affiche exactement combien de flous te manque —{" "}
              <em className="not-italic font-semibold text-ink">bla Excel, bla mchakil</em>.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-[13px]">
              <Link
                href="/signup"
                className="rounded-[13px] px-[26px] py-3.5 text-[15.5px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg,#8b6ff0,#6f4ee0)",
                  boxShadow: "0 14px 30px -12px rgba(111,78,224,.7)",
                }}
              >
                Commencer →
              </Link>
              <Link
                href="/signup"
                className="rounded-[13px] border border-hair-strong px-6 py-3.5 text-[15.5px] font-semibold text-ink transition-colors hover:bg-white"
                style={{ background: "rgba(255,255,255,.8)" }}
              >
                Contacter les ventes
              </Link>
            </div>
          </div>

          {/* hero product mockup */}
          <div
            className="mx-auto max-w-[1000px] translate-y-1.5 overflow-hidden rounded-t-[18px] border border-hair bg-surface"
            style={{ boxShadow: "0 40px 90px -40px rgba(48,30,120,.5)" }}
          >
            <div className="flex items-center gap-2 border-b border-hair bg-surface-muted px-4 py-3">
              <span className="size-[11px] rounded-full bg-[#f3626b]" />
              <span className="size-[11px] rounded-full bg-warn" />
              <span className="size-[11px] rounded-full bg-good" />
              <span className="ml-3 text-[12.5px] font-medium text-ink-4">
                Fatora — Réconciliation · Juillet 2026
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 p-[18px]">
              <div className="rounded-[14px] bg-night p-4 text-white">
                <p className="mb-2 text-xs text-night-muted">Cash en transit</p>
                <p className="display text-[26px] leading-none tabular">
                  128 450 <span className="text-sm text-[#8b6ff0]">MAD</span>
                </p>
              </div>
              <div className="rounded-[14px] border border-hair p-4">
                <p className="mb-2 text-xs text-ink-4">Encaissé ce mois</p>
                <p className="display text-[26px] leading-none tabular text-good-ink">214 900</p>
              </div>
              <div className="rounded-[14px] border border-hair p-4">
                <p className="mb-2 text-xs text-ink-4">Taux livraison</p>
                <p className="display text-[26px] leading-none tabular">73%</p>
              </div>
              <div
                className="rounded-[14px] border p-4"
                style={{ borderColor: "rgba(209,73,91,.25)", background: "#fdf0f2" }}
              >
                <p className="mb-2 text-xs" style={{ color: "#b04555" }}>
                  Cash manquant
                </p>
                <p className="display text-[26px] leading-none tabular text-bad-ink">3 840</p>
              </div>
            </div>

            <div className="px-[18px] pb-[22px]">
              <div className="overflow-x-auto rounded-[14px] border border-hair">
                <div className="min-w-[560px]">
                  <div className="grid grid-cols-[1fr_1.4fr_1fr_.8fr] gap-3 bg-surface-muted px-4 py-[11px] text-[11px] font-bold uppercase tracking-[.4px] text-ink-4">
                    <span>Commande</span>
                    <span>Écart détecté</span>
                    <span>Courier</span>
                    <span className="text-right">Montant</span>
                  </div>
                  {MOCKUP_ROWS.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_1.4fr_1fr_.8fr] items-center gap-3 border-t border-hair px-4 py-3 text-[13px]"
                    >
                      <span className="font-mono text-xs font-semibold">{row.id}</span>
                      <span className="flex items-center gap-[7px]">
                        <span
                          className="size-[7px] rounded-full"
                          style={{ background: row.dot }}
                        />
                        {row.label}
                      </span>
                      <span className="text-ink-3">{row.courier}</span>
                      <span
                        className="text-right font-mono font-semibold tabular"
                        style={{ color: row.amountColor }}
                      >
                        {row.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        {/* ABOUT statement */}
        <section className="pt-[70px] pb-[54px]">
          <Eyebrow className="mb-5">À propos</Eyebrow>
          <p
            className="max-w-[920px] font-sans text-[22px] sm:text-[30px] font-semibold leading-[1.4]"
            style={{ color: "#c3c3cc", textWrap: "pretty" }}
          >
            On simplifie la compta COD avec des <span className="text-ink">outils intelligents</span>{" "}
            qui t&apos;aident à suivre, réconcilier et{" "}
            <span className="text-ink">récupérer ton cash</span>. Fini le sentiment d&apos;être{" "}
            <span className="text-ink">riche sur papier et fauché en banque</span> — tu vois enfin
            ton vrai profit.
          </p>
        </section>

        {/* LOGO CLOUD */}
        <section className="pb-[60px]">
          <p className="mb-[26px] text-center text-[13px] text-ink-4">
            Compatible avec tes outils et tous les couriers marocains
          </p>
          <div className="flex flex-wrap items-center justify-between gap-6 opacity-55">
            {LOGOS.map((logo) => (
              <span
                key={logo}
                className="text-[19px] font-bold tracking-[-.3px]"
                style={{ color: "#5b5b66" }}
              >
                {logo}
              </span>
            ))}
          </div>
        </section>

        {/* 3 STEPS */}
        <section id="comment" className="scroll-mt-8 pt-11 pb-[60px] text-center">
          <Eyebrow>3 étapes simples</Eyebrow>
          <h2 className="display mb-11 text-[32px] sm:text-[40px] tracking-[-.3px]">
            Démarre en trois étapes simples
          </h2>
          <div className="grid sm:grid-cols-3 gap-5 text-left">
            {STEPS.map((step) => (
              <div key={step.n} className="rounded-[18px] border border-hair bg-surface p-[26px]">
                <div className="display mb-4 text-[38px] leading-none text-brand-pale">
                  {step.n}
                </div>
                <p className="mb-2 text-lg font-bold">{step.title}</p>
                <p className="text-[14.5px] leading-[1.55] text-ink-3">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURE GRID 2x2 — each card carries a mini-mockup of the feature */}
        <section id="fonctionnalites" className="scroll-mt-8 pt-11 pb-[60px] text-center">
          <Eyebrow>Fonctionnalités</Eyebrow>
          <h2 className="display mb-2 text-[32px] sm:text-[40px] tracking-[-.3px]">
            Gère ton business COD en confiance
          </h2>
          <p className="mb-10 text-base text-ink-3">
            Tout ce qu&apos;il faut pour suivre, réconcilier et récupérer ton cash — plus vite.
          </p>

          <div className="grid lg:grid-cols-2 gap-5 text-left">
            {/* import */}
            <div className="rounded-[18px] border border-hair bg-surface p-6">
              <div className="mb-[18px] flex flex-col gap-[9px] rounded-[14px] border border-hair bg-surface-muted p-4">
                <div
                  className="rounded-[10px] border-2 border-dashed p-3.5 text-center text-[12.5px] font-semibold text-brand"
                  style={{ borderColor: "rgba(123,92,240,.3)" }}
                >
                  📥 Glisse ton CSV / Excel
                </div>
                <div className="flex gap-2">
                  <span className="flex-1 rounded-lg border border-hair bg-surface px-2.5 py-[7px] text-[11.5px] text-ink-3">
                    commandes.csv
                  </span>
                  <span className="rounded-lg bg-good-tint px-2.5 py-[7px] text-[11.5px] font-semibold text-good-ink">
                    342 ✓
                  </span>
                </div>
              </div>
              <p className="mb-1.5 text-[17px] font-bold">Import flexible &amp; mapping auto</p>
              <p className="text-sm leading-[1.5] text-ink-3">
                Shopify, WooCommerce, Google Sheets ou manuel — les colonnes se mappent toutes
                seules.
              </p>
            </div>

            {/* reconciliation */}
            <div className="rounded-[18px] border border-hair bg-surface p-6">
              <div className="mb-[18px] flex items-center gap-3 rounded-[14px] border border-hair bg-surface-muted p-4">
                <div className="flex-1 rounded-[9px] border border-hair bg-surface p-2.5 text-[11.5px] font-semibold">
                  Commande
                  <br />
                  <span className="font-mono text-ink-4">CMD-2231</span>
                </div>
                <span className="grid size-[30px] flex-none place-items-center rounded-full bg-good-tint font-bold text-good-ink">
                  ✓
                </span>
                <div className="flex-1 rounded-[9px] border border-hair bg-surface p-2.5 text-[11.5px] font-semibold">
                  Rapport Amana
                  <br />
                  <span className="font-mono text-good-ink">+320 MAD</span>
                </div>
              </div>
              <p className="mb-1.5 text-[17px] font-bold">Réconciliation automatique</p>
              <p className="text-sm leading-[1.5] text-ink-3">
                Chaque ligne courier croisée par tracking, téléphone ou n° de commande. 94%
                auto-matché.
              </p>
            </div>

            {/* alerts */}
            <div className="rounded-[18px] border border-hair bg-surface p-6">
              <div className="mb-[18px] rounded-[14px] bg-night p-4 text-white">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs text-night-muted">Alerte de paiement</span>
                  <span
                    className="rounded-full px-2 py-[3px] text-[10.5px] font-bold text-bad"
                    style={{ background: "#3a1c22" }}
                  >
                    12 cmd
                  </span>
                </div>
                <p className="display text-[28px] leading-none tabular">
                  3 840 <span className="text-[15px] text-bad">MAD manquants</span>
                </p>
              </div>
              <p className="mb-1.5 text-[17px] font-bold">Alertes d&apos;écart</p>
              <p className="text-sm leading-[1.5] text-ink-3">
                « Livré selon le courier mais pas payé » — chiffré en MAD, direct sur ton écran.
              </p>
            </div>

            {/* profit */}
            <div className="rounded-[18px] border border-hair bg-surface p-6">
              <div className="mb-[18px] flex flex-col gap-2.5 rounded-[14px] border border-hair bg-surface-muted p-4">
                <div>
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="font-semibold">Crème visage</span>
                    <span className="font-mono text-good-ink">+9%</span>
                  </div>
                  <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "#e9e6f2" }}>
                    <div className="h-full w-[82%] rounded-full bg-good" />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="font-semibold">Montre connectée</span>
                    <span className="font-mono text-bad-ink">41% refus</span>
                  </div>
                  <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "#e9e6f2" }}>
                    <div className="h-full w-[41%] rounded-full bg-bad-ink" />
                  </div>
                </div>
              </div>
              <p className="mb-1.5 text-[17px] font-bold">Profit réel par produit</p>
              <p className="text-sm leading-[1.5] text-ink-3">
                Après retours, frais COD et coût d&apos;achat. Repère les produits qui te font
                perdre du cash.
              </p>
            </div>
          </div>
        </section>

        {/* EVERYTHING YOU NEED split */}
        <section className="grid lg:grid-cols-[.9fr_1.1fr] items-center gap-12 pt-11 pb-16">
          <div>
            <Eyebrow className="mb-4">La plateforme</Eyebrow>
            <h2 className="display mb-7 text-[30px] sm:text-[38px] leading-[1.1] tracking-[-.3px]">
              Tout ce qu&apos;il te faut pour gérer ton COD plus malin
            </h2>
            <div className="flex flex-col">
              {NEED_LIST.map((item) => (
                <div key={item.title} className="border-t border-hair-strong py-4">
                  <p className="mb-1 text-base font-bold">{item.title}</p>
                  <p className="text-sm leading-[1.5] text-ink-3">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-[20px] border border-hair p-[22px]"
            style={{
              background: "linear-gradient(160deg,#eef0fd,#e3effb)",
              boxShadow: "0 30px 70px -40px rgba(48,30,120,.4)",
            }}
          >
            <div className="overflow-hidden rounded-[14px] border border-hair bg-surface">
              <div className="flex items-center justify-between border-b border-hair px-4 py-3.5">
                <span className="text-sm font-bold">Cash flow — Juillet</span>
                <span className="text-[11.5px] text-ink-4">Live</span>
              </div>
              <div className="flex h-[150px] items-end gap-2.5 px-4 py-[18px]">
                {[
                  { h: "52%", bg: "#e6e1f5" },
                  { h: "70%", bg: "#e6e1f5" },
                  { h: "60%", bg: "#c9bafb" },
                  { h: "86%", bg: "#8b6ff0" },
                  { h: "100%", bg: "#0f0f12" },
                  { h: "74%", bg: "#e6e1f5" },
                ].map((bar, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-md"
                    style={{ height: bar.h, background: bar.bg }}
                  />
                ))}
              </div>
              <div
                className="grid grid-cols-2 gap-px border-t border-hair"
                style={{ background: "rgba(15,15,18,.06)" }}
              >
                <div className="bg-surface px-4 py-3.5">
                  <p className="text-xs text-ink-4">Reçu en banque</p>
                  <p className="font-mono text-base font-bold tabular text-good-ink">214 900</p>
                </div>
                <div className="bg-surface px-4 py-3.5">
                  <p className="text-xs text-ink-4">En transit</p>
                  <p className="font-mono text-base font-bold tabular">128 450</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING — client component: the monthly/yearly toggle is stateful */}
        <PricingSection />

        {/* FOOTER CTA */}
        <section className="pt-[30px] pb-[70px]">
          <div className="relative overflow-hidden rounded-3xl bg-night p-8 sm:p-12 text-center text-white">
            <div
              aria-hidden
              className="absolute -right-10 -top-10 size-[200px] rounded-full"
              style={{ background: "radial-gradient(circle,rgba(139,111,240,.4),transparent 70%)" }}
            />
            <h2 className="display relative mb-3 text-[30px] sm:text-[38px]">
              3afak, wqf tkhser flous.
            </h2>
            <p className="relative mx-auto mb-7 max-w-[520px] text-base text-night-text">
              14 jours gratuits, sans carte. Importe, réconcilie et vois ton vrai cash en 2
              minutes.
            </p>
            <Link
              href="/signup"
              className="relative inline-block rounded-[14px] bg-white px-8 py-[15px] text-base font-bold text-night transition-colors hover:bg-white/90"
            >
              Commencer maintenant →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
