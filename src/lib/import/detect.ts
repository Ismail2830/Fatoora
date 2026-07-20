import { normalizeHeader } from "./read-file";
import type { ColumnMap, FieldSpec } from "./types";

/**
 * Guess which source column feeds each canonical field.
 *
 * The seller can always correct this in the mapping UI, so a wrong guess is
 * cheap and a right guess saves them the whole screen. Scoring, best first:
 *   3  header is exactly an alias
 *   2  header contains an alias as a whole word
 *   1  header merely contains the alias text
 * Each source column is used at most once, so "date" can't feed both
 * "date commande" and "date livraison".
 */
export function detectMapping<F extends string>(
  headers: string[],
  specs: FieldSpec<F>[],
): ColumnMap<F> {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  type Candidate = { field: F; header: string; score: number };
  const candidates: Candidate[] = [];

  for (const spec of specs) {
    for (const { raw, norm } of normalized) {
      if (!norm) continue;
      let best = 0;
      for (const alias of spec.aliases) {
        if (norm === alias) best = Math.max(best, 3);
        else if (new RegExp(`\\b${escapeRegex(alias)}\\b`).test(norm)) best = Math.max(best, 2);
        else if (norm.includes(alias)) best = Math.max(best, 1);
      }
      if (best > 0) candidates.push({ field: spec.field, header: raw, score: best });
    }
  }

  // Strongest matches claim their column first.
  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMap<F> = {};
  const usedHeaders = new Set<string>();

  for (const c of candidates) {
    if (mapping[c.field] !== undefined) continue;
    if (usedHeaders.has(c.header)) continue;
    mapping[c.field] = c.header;
    usedHeaders.add(c.header);
  }

  return mapping;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Required fields with no column assigned — blocks the import. */
export function missingRequired<F extends string>(
  mapping: ColumnMap<F>,
  specs: FieldSpec<F>[],
): FieldSpec<F>[] {
  return specs.filter((s) => s.required && !mapping[s.field]);
}
