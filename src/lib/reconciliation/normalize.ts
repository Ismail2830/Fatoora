import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Courier reports are hand-made Excel files. Nothing in them is clean, so every
 * value used for matching goes through here first. These functions are pure and
 * total: garbage in, null out — never a throw.
 */

/**
 * Moroccan mobile numbers reach us as 0612345678, +212612345678, 212612345678,
 * "06 12 34 56 78", or 612345678 — often several shapes inside one file.
 * Reduce every form to the 9 significant digits ("612345678") so they compare
 * equal. Returns null when there aren't enough digits to be a real number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  let digits = String(input).replace(/\D/g, "");
  if (!digits) return null;

  // Excel strips leading zeros from anything it decides is a number, so a
  // phone stored as text "0612345678" can arrive as 612345678.
  if (digits.startsWith("00212")) digits = digits.slice(5);
  else if (digits.startsWith("212")) digits = digits.slice(3);

  digits = digits.replace(/^0+/, "");

  // Moroccan subscriber numbers are 9 digits after the country code/trunk 0.
  if (digits.length < 9) return null;

  // Keep the last 9 to survive stray prefixes we didn't anticipate.
  return digits.slice(-9);
}

/**
 * Render a stored (normalized, 9-digit) phone the way a Moroccan reads it:
 * "612345678" -> "06 12 34 56 78".
 *
 * Phones are stored normalized because the number is a match key, and keys
 * must compare equal. Formatting is a display concern and belongs here, not
 * in the database.
 */
export function formatPhone(stored: string | null | undefined): string {
  const digits = normalizePhone(stored);
  if (!digits) return stored ?? "";
  const full = `0${digits}`;
  return `${full.slice(0, 2)} ${full.slice(2, 4)} ${full.slice(4, 6)} ${full.slice(6, 8)} ${full.slice(8)}`;
}

/** International form for tel: and wa.me links — "612345678" -> "212612345678". */
export function internationalPhone(stored: string | null | undefined): string | null {
  const digits = normalizePhone(stored);
  return digits ? `212${digits}` : null;
}

/**
 * Tracking numbers differ per courier but always compare case-insensitively
 * and ignore the spaces/dashes humans sprinkle in.
 */
export function normalizeTracking(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input).trim().toUpperCase().replace(/[\s\-_.]/g, "");
  return cleaned.length >= 4 ? cleaned : null;
}

/** Order references: "cmd-2231", "CMD 2231", " CMD2231 " all mean CMD2231. */
export function normalizeReference(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input).trim().toUpperCase().replace(/[\s\-_.#]/g, "");
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * City names arrive accented, unaccented, and in several transliterations.
 * Fold to a comparable key: "Fès" / "Fes" / "FES" -> "fes".
 */
export function normalizeCity(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input)
    .trim()
    .normalize("NFD")
    // Strip combining accents.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-_']+/g, " ")
    .trim();
  return cleaned.length ? cleaned : null;
}

/** Canonical spelling for display, keyed by normalized form. */
export const CITY_CANONICAL: Record<string, string> = {
  casablanca: "Casablanca",
  casa: "Casablanca",
  "dar el beida": "Casablanca",
  rabat: "Rabat",
  sale: "Salé",
  temara: "Témara",
  kenitra: "Kénitra",
  marrakech: "Marrakech",
  marrakesh: "Marrakech",
  fes: "Fès",
  fez: "Fès",
  meknes: "Meknès",
  tanger: "Tanger",
  tangier: "Tanger",
  tetouan: "Tétouan",
  agadir: "Agadir",
  oujda: "Oujda",
  nador: "Nador",
  eljadida: "El Jadida",
  "el jadida": "El Jadida",
  safi: "Safi",
  benimellal: "Béni Mellal",
  "beni mellal": "Béni Mellal",
  mohammedia: "Mohammedia",
  laayoune: "Laâyoune",
  essaouira: "Essaouira",
  taza: "Taza",
  khouribga: "Khouribga",
  settat: "Settat",
  berrechid: "Berrechid",
};

/** Best-effort display name; unknown cities pass through title-cased. */
export function canonicalCity(input: string | null | undefined): string | null {
  const key = normalizeCity(input);
  if (!key) return null;
  if (CITY_CANONICAL[key]) return CITY_CANONICAL[key];
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Courier status wording, mapped to our enum. Each courier invents its own
 * vocabulary and mixes French, English and transliterated Darija — this table
 * is the accumulated knowledge and the main thing to extend when onboarding a
 * new courier. Ordering matters: check the most specific phrases first, since
 * "refus" appears inside "retour apres refus".
 */
const STATUS_PATTERNS: Array<[RegExp, OrderStatus]> = [
  // Refused must precede returned: a refusal usually also says "retour".
  [/\b(refus|refuse|refusee?|refused|rejete|rejected|client\s*refuse)\b/i, "REFUSED"],
  [/\b(annul|cancel|canceled|cancelled|annulee?)\b/i, "CANCELLED"],
  [/\b(perdu|perdue|lost|egare|egaree|disparu|damaged|endommage)\b/i, "LOST"],
  [/\b(retour|retourne|retournee?|returned|renvoye|back\s*to\s*sender|rts)\b/i, "RETURNED"],
  [
    /\b(livre|livree?|delivered|delivre|delivree|distribue|remis|recu\s*par\s*client|paye)\b/i,
    "DELIVERED",
  ],
  [
    /\b(transit|en\s*cours|expedie|expediee?|shipped|ramasse|picked|pickup|out\s*for\s*delivery|en\s*route|dispatche?)\b/i,
    "IN_TRANSIT",
  ],
  [/\b(confirme|confirmee?|confirmed|prepare|preparation)\b/i, "CONFIRMED"],
  [/\b(en\s*attente|attente|pending|nouveau|new|cree)\b/i, "PENDING"],
];

/**
 * Map a courier's free-text status to our enum, or null if unrecognised.
 * Null is deliberate: a wrong guess here silently corrupts the money numbers,
 * so an unknown status should surface as an import error instead.
 */
export function normalizeStatus(
  input: string | null | undefined,
  overrides?: Record<string, string>,
): OrderStatus | null {
  if (!input) return null;

  const folded = foldText(input);
  if (!folded) return null;

  // A courier's own vocabulary is consulted first: "livre paye" is unambiguous
  // for that courier, where the generic patterns would have to guess. Longest
  // key wins, so "retour agence" beats a bare "retour".
  if (overrides) {
    const keys = Object.keys(overrides).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (folded.includes(foldText(key))) return overrides[key] as OrderStatus;
    }
  }

  for (const [pattern, status] of STATUS_PATTERNS) {
    if (pattern.test(folded)) return status;
  }
  return null;
}

/** Fold accents, case and whitespace runs so messy text compares equal. */
export function foldText(input: string): string {
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Amounts arrive as "1 250,00", "1,250.00", "1250 DH", "1.250,50" or a real
 * number. Returns null rather than 0 when unparseable — 0 is a valid amount
 * and would quietly become a false "not paid" discrepancy.
 */
export function parseAmount(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let text = String(input).trim();
  if (!text) return null;

  // Drop currency words/symbols and spaces used as thousands separators.
  text = text
    .replace(/(mad|dhs?|dirhams?|درهم)/gi, "")
    .replace(/[\s\u202F\u00A0]/g, "")
    .trim();

  if (!text) return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^-/, "");

  // A bare "-" or "()" is how spreadsheets write "no value". Once the sign is
  // stripped nothing is left, and Number("") would hand back 0 — silently
  // turning an empty cell into a real amount.
  if (!/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal separator.
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Only commas. "1,250" is thousands; "1,25" is decimal. Decide by how many
    // digits follow the final comma — 3 means grouping.
    const after = text.length - lastComma - 1;
    const commaCount = (text.match(/,/g) ?? []).length;
    if (after === 3 && commaCount >= 1 && !/^,/.test(text)) text = text.replace(/,/g, "");
    else text = text.replace(",", ".");
  } else if (lastDot !== -1) {
    const after = text.length - lastDot - 1;
    const dotCount = (text.match(/\./g) ?? []).length;
    // "1.250" with exactly 3 trailing digits is European grouping.
    if (after === 3 && dotCount >= 1) text = text.replace(/\./g, "");
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  // Guard against -0, which compares oddly and formats as "-0 MAD".
  if (value === 0) return 0;
  return negative ? -value : value;
}

/**
 * Dates arrive as "15/07/2026", "2026-07-15", "15-07-2026" or an Excel serial.
 * Moroccan files are day-first; never let JS parse "01/02/2026" as February 1st.
 */
export function parseDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  // Excel serial date: days since 1899-12-30.
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0 || input > 100000) return null;
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const text = String(input).trim();
  if (!text) return null;

  // Day-first with / . or - separators.
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO-ish (year first) is unambiguous.
  const ymd = text.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/);
  if (ymd) {
    const d = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
