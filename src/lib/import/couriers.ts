import type { FieldSpec, ReportField } from "./types";
import { REPORT_FIELD_SPECS } from "./fields";

/**
 * Per-courier report parsers.
 *
 * Every Moroccan courier invents its own column names and status wording, and
 * changes them without warning. Rather than a bespoke parser per courier, each
 * one contributes extra header aliases and status synonyms on top of the
 * generic engine — so onboarding a new courier is a data change here, not code.
 *
 * `statusWords` is merged into the shared status matcher at parse time, which
 * is how "TENTATIVE ECHOUEE" (Ozone) or "EN INSTANCE" (Amana) get understood.
 */

export type CourierProfile = {
  slug: string;
  name: string;
  /** Extra aliases merged into the shared report field specs. */
  aliases?: Partial<Record<ReportField, string[]>>;
  /**
   * Courier-specific status wording -> our vocabulary. Keys are matched
   * against the normalized (lowercase, unaccented) status text.
   */
  statusWords?: Record<string, string>;
  notes?: string;
};

export const COURIER_PROFILES: CourierProfile[] = [
  {
    slug: "amana",
    name: "Amana",
    notes:
      "Poste Maroc. Reports are Excel, often with a merged title row above the header.",
    aliases: {
      trackingNumber: ["n envoi", "numero envoi", "code envoi", "n objet"],
      status: ["etat envoi", "dernier etat", "situation envoi"],
      codAmount: ["montant remboursement", "contre remboursement", "crbt"],
      paidAmount: ["montant mandat", "montant verse", "mandat"],
      reportDate: ["date etat", "date evenement"],
    },
    statusWords: {
      "en instance": "IN_TRANSIT",
      "arrive au centre": "IN_TRANSIT",
      distribue: "DELIVERED",
      "remis au destinataire": "DELIVERED",
      "retourne a l expediteur": "RETURNED",
      "non reclame": "RETURNED",
    },
  },
  {
    slug: "ozone",
    name: "Ozone Express",
    aliases: {
      trackingNumber: ["code", "code colis", "n colis"],
      status: ["statut colis", "dernier statut"],
      codAmount: ["prix", "prix colis"],
      paidAmount: ["montant a verser", "net"],
      fee: ["tarif livraison", "frais colis"],
    },
    statusWords: {
      "tentative echouee": "IN_TRANSIT",
      "en cours de distribution": "IN_TRANSIT",
      "livre paye": "DELIVERED",
      "refuse par le client": "REFUSED",
      "retour agence": "RETURNED",
      "retour expediteur": "RETURNED",
    },
  },
  {
    slug: "cathedis",
    name: "Cathedis",
    aliases: {
      trackingNumber: ["code envoi", "n envoi", "reference envoi"],
      status: ["etat", "statut envoi"],
      codAmount: ["montant crbt", "crbt"],
      paidAmount: ["montant regle", "regle"],
      fee: ["frais transport"],
    },
    statusWords: {
      "livre au client": "DELIVERED",
      "en cours livraison": "IN_TRANSIT",
      "refus client": "REFUSED",
      "retour au vendeur": "RETURNED",
      "colis perdu": "LOST",
    },
  },
  {
    slug: "sendit",
    name: "Sendit",
    aliases: {
      trackingNumber: ["code suivi", "tracking code", "n envoi"],
      status: ["statut envoi", "delivery status"],
      codAmount: ["prix produit", "cod value"],
      paidAmount: ["montant a payer", "payout"],
      fee: ["frais sendit", "delivery fee"],
    },
    statusWords: {
      delivered: "DELIVERED",
      "in progress": "IN_TRANSIT",
      "out for delivery": "IN_TRANSIT",
      returned: "RETURNED",
      refused: "REFUSED",
      cancelled: "CANCELLED",
    },
  },
  {
    slug: "generic",
    name: "Autre courier",
    notes: "Falls back to the shared aliases only — the seller maps the rest.",
  },
];

export function getCourierProfile(slug: string): CourierProfile {
  return (
    COURIER_PROFILES.find((p) => p.slug === slug) ??
    COURIER_PROFILES.find((p) => p.slug === "generic")!
  );
}

/**
 * Report field specs with a courier's own aliases folded in, so auto-detection
 * recognises that courier's column names first.
 */
export function reportSpecsFor(slug: string): FieldSpec<ReportField>[] {
  const profile = getCourierProfile(slug);
  if (!profile.aliases) return REPORT_FIELD_SPECS;

  return REPORT_FIELD_SPECS.map((spec) => {
    const extra = profile.aliases?.[spec.field];
    if (!extra?.length) return spec;
    // Courier-specific aliases go first so they win ties against generic ones.
    return { ...spec, aliases: [...extra, ...spec.aliases] };
  });
}

export type StoreCourier = { id: string; slug: string; name: string };

/** Fold text for courier-name matching: lowercase, unaccented, single-spaced. */
function fold(text: string): string {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve the courier text in one report row to one of the store's couriers.
 *
 * A single downloaded file mixes couriers, and each writes its own name in its
 * own way — "OZONE", "Ozone Express", "ozone-express". Matching goes
 * strictest-first (exact slug, exact folded name, then a clean one-directional
 * containment) and refuses when two couriers could both be meant. A wrong
 * courier here would apply the wrong fee rules and mis-scope matching, so an
 * unresolved row (courier stays null) is the safer failure.
 */
export function resolveCourierSlug(
  raw: string | null | undefined,
  couriers: StoreCourier[],
): string | null {
  if (!raw) return null;
  const wanted = fold(raw);
  if (!wanted) return null;

  // Exact slug or exact folded name.
  const exact = couriers.find(
    (c) => c.slug === wanted || fold(c.name) === wanted,
  );
  if (exact) return exact.slug;

  // The known profile aliases: "OZONE" should still reach the ozone profile
  // even if the store named its courier "Ozone Express".
  const bySlugToken = couriers.find((c) => {
    const slugFolded = fold(c.slug);
    return wanted.includes(slugFolded) || slugFolded.includes(wanted);
  });
  if (bySlugToken) return bySlugToken.slug;

  // One-directional containment on the name, but only when it's unambiguous.
  const partial = couriers.filter((c) => {
    const name = fold(c.name);
    return name.includes(wanted) || wanted.includes(name);
  });
  return partial.length === 1 ? partial[0].slug : null;
}
