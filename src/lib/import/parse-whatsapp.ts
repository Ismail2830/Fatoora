import {
  CITY_CANONICAL,
  foldText,
  normalizePhone,
  parseAmount,
} from "@/lib/reconciliation/normalize";

/**
 * Pull an order out of a pasted WhatsApp / DM / phone-note blob.
 *
 * Moroccan COD orders arrive as free text mixing French, Latin-script Darija
 * and Arabic script, in no fixed order. This parser is deliberately
 * conservative: it fills what it can prove and leaves the rest blank rather
 * than guessing. Everything it produces is shown for review before saving —
 * it exists to save typing, not to be an authority.
 *
 * Phone and city are deterministic and reliable. Name and address are
 * heuristics and will sometimes be wrong; that is why nothing auto-saves.
 */

export type ParsedField<T> = {
  value: T | null;
  /**
   * How much the UI should trust this:
   *  high   — matched a hard pattern (a phone, a known city)
   *  low    — a guess worth showing but worth checking
   *  null value means we found nothing at all.
   */
  confidence: "high" | "low" | null;
};

export type ParsedWhatsAppOrder = {
  customerName: ParsedField<string>;
  phone: ParsedField<string>;
  city: ParsedField<string>;
  address: ParsedField<string>;
  productName: ParsedField<string>;
  quantity: ParsedField<number>;
  totalAmount: ParsedField<number>;
};

const NOT_FOUND = { value: null, confidence: null } as const;

/** WhatsApp export lines look like "[15/07/2026, 14:23] Youssef: salam". */
const WA_LINE = /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:[-–]\s*)?([^:]{2,40}):\s*(.*)$/;

/** Words that mark a line as an address rather than a name. */
const ADDRESS_HINTS = [
  "rue", "hay", "quartier", "lot", "imm", "immeuble", "apt", "appartement",
  "etage", "residence", "res", "bloc", "avenue", "av", "bd", "boulevard",
  "derb", "zanka", "sidi", "ain", "n°", "no ", "num ", "cite", "lotissement",
];

/** Words a name never contains, but an order line often does. */
const NOISE_HINTS = [
  "salam", "bonjour", "hello", "bghit", "commande", "svp", "merci", "prix",
  "dh", "mad", "dirham", "livraison", "adresse", "tel", "gsm", "cod",
  "confirmer", "produit", "qty", "quantite",
];

export function parseWhatsAppOrder(input: string): ParsedWhatsAppOrder {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return {
      customerName: NOT_FOUND,
      phone: NOT_FOUND,
      city: NOT_FOUND,
      address: NOT_FOUND,
      productName: NOT_FOUND,
      quantity: NOT_FOUND,
      totalAmount: NOT_FOUND,
    };
  }

  // Strip WhatsApp export chrome, remembering the sender — in a real chat the
  // sender's name is usually the customer's name, and it beats any guess.
  let senderName: string | null = null;
  const lines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(WA_LINE);
    if (match) {
      senderName ??= cleanName(match[1]);
      if (match[2].trim()) lines.push(match[2].trim());
    } else if (line.trim()) {
      lines.push(line.trim());
    }
  }

  const body = lines.join("\n");

  const phone = findPhone(body);
  const city = findCity(body);
  const amount = findAmount(body);
  const quantity = findQuantity(body);
  const address = findAddress(lines);
  const name = findName(lines, { senderName, phone: phone.value, address: address.value });
  const product = findProduct(lines);

  return {
    customerName: name,
    phone,
    city,
    address,
    productName: product,
    quantity,
    totalAmount: amount,
  };
}

function findPhone(text: string): ParsedField<string> {
  // Moroccan mobiles, in every shape people type them. Allow separators
  // between groups because "06 12 34 56 78" is the common written form.
  const candidates = text.match(
    /(?:(?:\+|00)?212[\s.-]?|0)[\s.-]?[5-7](?:[\s.-]?\d){8}/g,
  );
  if (!candidates?.length) return NOT_FOUND;

  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    // Only mobiles (06/07) and the 05 landline range are real here.
    if (normalized && /^[5-7]/.test(normalized)) {
      return { value: normalized, confidence: "high" };
    }
  }
  return NOT_FOUND;
}

function findCity(text: string): ParsedField<string> {
  const folded = foldText(text);

  // Longest key first so "beni mellal" wins over a stray "beni".
  const keys = Object.keys(CITY_CANONICAL).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    // Word-boundary match: "sale" must not fire inside "salement", and
    // "casa" must not fire inside "casablanca" (longest-first handles that).
    const pattern = new RegExp(`(?:^|[^a-z])${escapeRegex(key)}(?:[^a-z]|$)`);
    if (pattern.test(folded)) {
      return { value: CITY_CANONICAL[key], confidence: "high" };
    }
  }
  return NOT_FOUND;
}

function findAmount(text: string): ParsedField<number> {
  // Horizontal whitespace only. Using \s here would match newlines, so
  // "Rue 5\n299 dh" would capture "5\n299" and quote the customer 5 299 MAD —
  // a price never spans two lines.
  const H = "[ \\t\\u00A0\\u202F]";

  // Prefer a number carrying a currency word: that's the price, not a house
  // number and not a quantity.
  const withCurrency = text.match(
    new RegExp(`(\\d[\\d${H.slice(1, -1)}.,]{0,9})${H}*(?:dh|dhs|mad|dirhams?|درهم)\\b`, "i"),
  );
  if (withCurrency) {
    const value = parseAmount(withCurrency[1]);
    if (value !== null && value > 0) return { value, confidence: "high" };
  }

  const afterLabel = text.match(
    new RegExp(`(?:prix|total|montant|thaman|سعر)${H}*:?${H}*(\\d[\\d${H.slice(1, -1)}.,]{0,9})`, "i"),
  );
  if (afterLabel) {
    const value = parseAmount(afterLabel[1]);
    if (value !== null && value > 0) return { value, confidence: "high" };
  }

  // Last resort: a bare 2–5 digit number that isn't part of the phone.
  // Low confidence on purpose — this is exactly where a house number lies.
  const stripped = text.replace(
    /(?:(?:\+|00)?212[\s.-]?|0)[\s.-]?[5-7](?:[\s.-]?\d){8}/g,
    " ",
  );
  const bare = stripped.match(/\b(\d{2,5})(?:[.,]\d{1,2})?\b/);
  if (bare) {
    const value = parseAmount(bare[0]);
    if (value !== null && value >= 20) return { value, confidence: "low" };
  }

  return NOT_FOUND;
}

function findQuantity(text: string): ParsedField<number> {
  const match = text.match(/\b(\d{1,2})\s*(?:x|×|pcs?|pieces?|unites?)\b/i);
  if (match) {
    const value = Number(match[1]);
    if (value > 0 && value < 100) return { value, confidence: "high" };
  }
  // Nothing said, so it's one item. Saying "1" is safe; saying "0" never is.
  return { value: 1, confidence: "low" };
}

function findAddress(lines: string[]): ParsedField<string> {
  for (const line of lines) {
    const folded = foldText(line);
    if (folded.length < 6) continue;
    if (ADDRESS_HINTS.some((hint) => folded.includes(hint))) {
      return { value: line.trim(), confidence: "low" };
    }
  }
  return NOT_FOUND;
}

function findName(
  lines: string[],
  ctx: { senderName: string | null; phone: string | null; address: string | null },
): ParsedField<string> {
  // A real WhatsApp export tells us who is talking. Trust that over a guess.
  if (ctx.senderName && !normalizePhone(ctx.senderName)) {
    return { value: ctx.senderName, confidence: "high" };
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === ctx.address) continue;

    const folded = foldText(trimmed);
    if (!folded || folded.length < 3 || folded.length > 40) continue;
    if (/\d/.test(trimmed)) continue; // names don't carry digits
    if (NOISE_HINTS.some((hint) => folded.includes(hint))) continue;
    if (CITY_CANONICAL[folded]) continue; // that's the city line
    if (ADDRESS_HINTS.some((hint) => folded.includes(hint))) continue;

    const words = trimmed.split(/\s+/);
    if (words.length > 4) continue; // a sentence, not a name

    return { value: trimmed, confidence: "low" };
  }

  return NOT_FOUND;
}

function findProduct(lines: string[]): ParsedField<string> {
  const labelled = lines.find((l) => /^(?:produit|article|commande)\s*:/i.test(l.trim()));
  if (labelled) {
    const value = labelled.replace(/^[^:]*:\s*/, "").trim();
    if (value) return { value, confidence: "high" };
  }

  // Otherwise the product is usually whatever follows "bghit" ("I want").
  const wanted = lines
    .map((l) => l.match(/\b(?:bghit|brit|nbghi|je veux|i want)\b\s*(.{2,40})/i))
    .find(Boolean);
  if (wanted) {
    const value = wanted[1].trim().replace(/[.,;!?]+$/, "");
    if (value) return { value, confidence: "low" };
  }

  return NOT_FOUND;
}

function cleanName(text: string): string | null {
  const trimmed = text.trim().replace(/^[~\s]+/, "");
  return trimmed.length >= 2 && trimmed.length <= 40 ? trimmed : null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
