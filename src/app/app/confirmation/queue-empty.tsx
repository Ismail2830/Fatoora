import { AddOrderButton } from "@/components/app/add-order-button";

export function QueueEmpty({
  scheduled,
  confirmedToday,
}: {
  scheduled: number;
  confirmedToday: number;
}) {
  return (
    <div className="bg-surface border border-hair rounded-[18px] p-12 text-center">
      <p className="text-5xl mb-4">🎉</p>
      <h2 className="display text-2xl mb-2">Rien à confirmer</h2>

      <p className="text-sm text-ink-3 max-w-sm mx-auto">
        {confirmedToday > 0
          ? `${confirmedToday} commande${confirmedToday > 1 ? "s" : ""} confirmée${confirmedToday > 1 ? "s" : ""} aujourd'hui.`
          : "Les nouvelles commandes manuelles arriveront ici."}
        {scheduled > 0 &&
          ` ${scheduled} commande${scheduled > 1 ? "s" : ""} à rappeler plus tard — elles réapparaîtront à l'heure prévue.`}
      </p>

      {/* An empty queue is exactly when to offer the next action. */}
      <div className="mt-6 flex justify-center">
        <AddOrderButton />
      </div>
    </div>
  );
}
