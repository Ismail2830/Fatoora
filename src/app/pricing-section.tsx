"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Pricing, cloned from the bundled Khalas.html reference — the one stateful
 * piece of the landing page, hence a client component: the monthly/yearly
 * toggle swaps every tier's price (yearly is the reference's −17%).
 */

type Tier = {
  name: string;
  mo: number;
  yr: number;
  tag: string;
  highlight: boolean;
  cta: string;
  feats: string[];
};

const TIERS: Tier[] = [
  {
    name: "Découverte",
    mo: 0,
    yr: 0,
    tag: "Pour débuter et tester",
    highlight: false,
    cta: "Commencer",
    feats: [
      "Jusqu'à 100 commandes/mois",
      "1 courier",
      "Réconciliation manuelle",
      "Dashboard de base",
    ],
  },
  {
    name: "Pro",
    mo: 299,
    yr: 249,
    tag: "Pour les boutiques qui scalent",
    highlight: true,
    cta: "Choisir Pro",
    feats: [
      "Commandes illimitées",
      "Tous les couriers",
      "Réconciliation automatique",
      "Profit réel + analytics",
      "Alertes d'écart",
    ],
  },
  {
    name: "Business",
    mo: 599,
    yr: 499,
    tag: "Pour les équipes et gros volumes",
    highlight: false,
    cta: "Contacter les ventes",
    feats: [
      "Tout dans Pro",
      "Multi-boutique",
      "Accès confirmatrice",
      "Blacklist clients",
      "Export comptable PDF/Excel",
    ],
  },
];

export function PricingSection() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const monthly = billing === "monthly";

  return (
    <section id="tarifs" className="scroll-mt-8 pt-11 pb-10 text-center">
      <div className="mb-3.5 inline-flex items-center gap-2 text-[13px] font-semibold text-brand">
        <span className="size-1.5 rounded-full bg-brand" />
        Tarifs
      </div>
      <h2 className="display mb-2.5 text-[32px] sm:text-[40px] tracking-[-.3px]">
        Tarifs clairs et simples
      </h2>
      <p className="mb-[26px] text-base text-ink-3">
        Choisis le plan qui suit ta boutique. Change quand tu veux.
      </p>

      {/* monthly / yearly toggle */}
      <div
        className="mb-[38px] inline-flex rounded-xl p-1"
        style={{ background: "#e4e1ee" }}
      >
        <button
          onClick={() => setBilling("monthly")}
          className="rounded-[9px] px-5 py-[9px] text-[13.5px] font-semibold transition-colors"
          style={{
            background: monthly ? "#0f0f12" : "transparent",
            color: monthly ? "#fff" : "#66666f",
          }}
        >
          Mensuel
        </button>
        <button
          onClick={() => setBilling("yearly")}
          className="rounded-[9px] px-5 py-[9px] text-[13.5px] font-semibold transition-colors"
          style={{
            background: monthly ? "transparent" : "#0f0f12",
            color: monthly ? "#66666f" : "#fff",
          }}
        >
          Annuel <span className="text-brand">−17%</span>
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 text-left">
        {TIERS.map((tier) => {
          const price = monthly ? tier.mo : tier.yr;
          const hl = tier.highlight;
          return (
            <div
              key={tier.name}
              className="rounded-[20px] border p-7"
              style={{
                background: hl ? "#0f0f12" : "#fff",
                borderColor: hl ? "#0f0f12" : "rgba(15,15,18,.08)",
              }}
            >
              <p className="mb-1 text-base font-bold" style={{ color: hl ? "#fff" : "#17171c" }}>
                {tier.name}
              </p>
              <p className="mb-5 text-[13px]" style={{ color: hl ? "#a8a8b4" : "#8a8a94" }}>
                {tier.tag}
              </p>

              <div className="mb-[22px] flex items-baseline gap-1.5">
                <span
                  className="display text-[46px] leading-none tabular"
                  style={{ color: hl ? "#fff" : "#17171c" }}
                >
                  {price.toLocaleString("fr-FR")}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: hl ? "#8b6ff0" : "#9a9aa4" }}
                >
                  MAD {price === 0 ? "gratuit" : "/mois"}
                </span>
              </div>

              <Link
                href="/signup"
                className="mb-[22px] block w-full rounded-xl border py-3 text-center text-sm font-semibold transition-opacity hover:opacity-85"
                style={{
                  background: hl ? "#0f0f12" : "#fff",
                  color: hl ? "#fff" : "#0f0f12",
                  borderColor: hl ? "#fff" : "rgba(15,15,18,.14)",
                }}
              >
                {tier.cta}
              </Link>

              <div
                className="mb-[18px] h-px"
                style={{ background: hl ? "rgba(255,255,255,.12)" : "rgba(15,15,18,.08)" }}
              />

              <div className="flex flex-col gap-[11px]">
                {tier.feats.map((feat) => (
                  <div
                    key={feat}
                    className="flex items-start gap-[9px] text-[13.5px]"
                    style={{ color: hl ? "#c8c8d0" : "#55555f" }}
                  >
                    <span className="flex-none font-bold text-brand">✓</span>
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
