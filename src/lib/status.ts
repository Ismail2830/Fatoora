import type {
  CancelReason,
  ConfirmationStatus,
  DiscrepancyStatus,
  DiscrepancyType,
  ImportStatus,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";

/**
 * Single source of truth for how domain states are worded and coloured.
 * The UI is French; enum values stay English so the code reads well.
 */

export type BadgeTone = "good" | "warn" | "bad" | "brand" | "secondary" | "outline";

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  IN_TRANSIT: "En transit",
  DELIVERED: "Livrée",
  RETURNED: "Retournée",
  REFUSED: "Refusée",
  LOST: "Perdue",
  CANCELLED: "Annulée",
};

export const orderStatusTone: Record<OrderStatus, BadgeTone> = {
  PENDING: "secondary",
  CONFIRMED: "brand",
  IN_TRANSIT: "warn",
  DELIVERED: "good",
  RETURNED: "bad",
  REFUSED: "bad",
  LOST: "bad",
  CANCELLED: "secondary",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  PENDING: "Pas encore payé",
  PAID: "Payé",
  PARTIAL: "Partiel",
  NOT_APPLICABLE: "—",
};

export const paymentStatusTone: Record<PaymentStatus, BadgeTone> = {
  PENDING: "warn",
  PAID: "good",
  PARTIAL: "warn",
  NOT_APPLICABLE: "secondary",
};

export const confirmationStatusLabel: Record<ConfirmationStatus, string> = {
  TO_CONFIRM: "À confirmer",
  CONFIRMED: "Confirmée",
  NO_ANSWER: "Pas de réponse",
  CALLBACK: "À rappeler",
  CANCELLED: "Annulée",
};

export const confirmationStatusTone: Record<ConfirmationStatus, BadgeTone> = {
  TO_CONFIRM: "brand",
  CONFIRMED: "good",
  NO_ANSWER: "warn",
  CALLBACK: "warn",
  CANCELLED: "secondary",
};

export const cancelReasonLabel: Record<CancelReason, string> = {
  TOO_EXPENSIVE: "Prix trop cher",
  CHANGED_MIND: "A changé d'avis",
  WRONG_NUMBER: "Faux numéro",
  UNREACHABLE: "Injoignable",
  DUPLICATE: "Doublon",
  TEST_ORDER: "Commande test",
  OTHER: "Autre",
};

/** Order matters: this is the button order the confirmatrice sees. */
export const CANCEL_REASONS: CancelReason[] = [
  "TOO_EXPENSIVE",
  "CHANGED_MIND",
  "WRONG_NUMBER",
  "DUPLICATE",
  "TEST_ORDER",
  "OTHER",
];

export const orderSourceLabel: Record<OrderSource, string> = {
  MANUAL: "Manuelle",
  IMPORT: "Importée",
  API: "API",
};

export const discrepancyLabel: Record<DiscrepancyType, string> = {
  DELIVERED_NOT_PAID: "Livré, pas payé",
  PAID_NOT_DELIVERED: "Payé, pas livré",
  AMOUNT_MISMATCH: "Montant différent",
  UNMATCHED_REPORT_LINE: "Ligne courier sans commande",
  UNMATCHED_ORDER: "Commande absente du rapport",
  STUCK_IN_TRANSIT: "Bloquée en transit",
  RETURN_FEE_CHARGED: "Frais de retour",
  LOST: "Colis perdu",
};

/** Shown under the title on the reconciliation screen — says why it matters. */
export const discrepancyHint: Record<DiscrepancyType, string> = {
  DELIVERED_NOT_PAID:
    "Le courier a marqué la commande livrée mais le cash n'est jamais arrivé.",
  PAID_NOT_DELIVERED:
    "Tu as reçu du cash pour une commande qui n'est pas marquée livrée.",
  AMOUNT_MISMATCH:
    "Le montant versé ne correspond pas au montant attendu après frais.",
  UNMATCHED_REPORT_LINE:
    "Le courier facture un colis qui ne correspond à aucune de tes commandes.",
  UNMATCHED_ORDER:
    "Tu as expédié cette commande mais le courier n'en parle pas dans son rapport.",
  STUCK_IN_TRANSIT: "Le colis traîne chez le courier depuis trop longtemps.",
  RETURN_FEE_CHARGED: "Retour facturé : tu paies l'aller-retour sans avoir vendu.",
  LOST: "Le courier a déclaré ce colis perdu.",
};

export const discrepancyTone: Record<DiscrepancyType, BadgeTone> = {
  DELIVERED_NOT_PAID: "bad",
  PAID_NOT_DELIVERED: "warn",
  AMOUNT_MISMATCH: "warn",
  UNMATCHED_REPORT_LINE: "warn",
  UNMATCHED_ORDER: "warn",
  STUCK_IN_TRANSIT: "warn",
  RETURN_FEE_CHARGED: "bad",
  LOST: "bad",
};

export const discrepancyStatusLabel: Record<DiscrepancyStatus, string> = {
  OPEN: "À régler",
  RESOLVED: "Réglé",
  IGNORED: "Ignoré",
};

export const importStatusLabel: Record<ImportStatus, string> = {
  PENDING: "En attente",
  PROCESSING: "En cours",
  COMPLETED: "Terminé",
  COMPLETED_WITH_ERRORS: "Terminé avec erreurs",
  FAILED: "Échoué",
};

export const importStatusTone: Record<ImportStatus, BadgeTone> = {
  PENDING: "secondary",
  PROCESSING: "brand",
  COMPLETED: "good",
  COMPLETED_WITH_ERRORS: "warn",
  FAILED: "bad",
};

/** Parcel is gone; no COD money is ever coming for these. */
export const FAILED_STATUSES: OrderStatus[] = [
  "RETURNED",
  "REFUSED",
  "LOST",
  "CANCELLED",
];

/** Parcel is still moving; cash is still expected. */
export const OPEN_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_TRANSIT"];

/** Courier said it arrived — the only status that should produce a payout. */
export function isDelivered(status: OrderStatus): boolean {
  return status === "DELIVERED";
}
