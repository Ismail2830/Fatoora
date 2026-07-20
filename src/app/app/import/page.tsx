import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import { getImportHistory } from "@/lib/queries/imports";
import { ImportWizard } from "./import-wizard";
import { ImportHistory } from "./import-history";

export const metadata: Metadata = { title: "Rapports couriers — Fatora" };

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await requireMoneyAccess();
  const history = await getImportHistory(session.storeId);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">
      <header className="mb-1">
        <h1 className="display text-[34px] leading-tight">Rapports couriers</h1>
        <p className="text-[14.5px] text-ink-3">
          Importe le rapport mensuel de tes couriers — Fatora réconcilie et te
          dit combien de cash te manque.
        </p>
      </header>

      <ImportWizard />

      <ImportHistory batches={history} />
    </div>
  );
}
