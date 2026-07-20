import { formatMAD } from "@/lib/money";

/**
 * Three totals, three different actions: money to chase, things to look into,
 * and costs already applied. Mixing them into one number would hide which
 * kind of work is waiting.
 */
export function SummaryStrip({
  receivableAmount,
  receivableCount,
  toInvestigate,
  costsAmount,
}: {
  receivableAmount: number;
  receivableCount: number;
  toInvestigate: number;
  costsAmount: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="bg-night text-white rounded-[18px] p-5 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -right-6 -top-6 size-[110px] rounded-full"
          style={{ background: "radial-gradient(circle,rgba(139,111,240,.4),transparent 70%)" }}
        />
        <div className="relative">
          <p className="text-[13px] text-white/70 mb-2">À recevoir</p>
          <p className="display text-[34px] leading-none tabular">{formatMAD(receivableAmount)}</p>
          <p className="text-xs text-night-muted mt-2">
            sur {receivableCount} commande{receivableCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-hair rounded-[18px] p-5">
        <p className="text-[13px] text-ink-3 mb-2">À vérifier</p>
        <p className="display text-[34px] leading-none">{toInvestigate}</p>
        <p className="text-xs text-ink-4 mt-2">lignes sans réponse claire</p>
      </div>

      <div className="bg-surface border border-hair rounded-[18px] p-5">
        <p className="text-[13px] text-ink-3 mb-2">Frais de retour</p>
        <p className="display text-[34px] leading-none tabular">{formatMAD(costsAmount)}</p>
        <p className="text-xs text-ink-4 mt-2">déjà appliqués, pour info</p>
      </div>
    </div>
  );
}
