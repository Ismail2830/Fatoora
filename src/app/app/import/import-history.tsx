"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, FileSpreadsheet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { importStatusLabel, importStatusTone } from "@/lib/status";
import type { ImportStatus } from "@/generated/prisma/enums";
import { undoImport } from "./actions";

type Batch = {
  id: string;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  rowCount: number;
  successCount: number;
  errorCount: number;
  status: ImportStatus;
  createdAt: string;
  lineCount: number;
  discrepancyCount: number;
};

export function ImportHistory({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!batches.length) return null;

  function undo(id: string) {
    startTransition(async () => {
      await undoImport(id);
      setConfirming(null);
      router.refresh();
    });
  }

  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-surface border border-hair rounded-[18px] p-5">
      <p className="font-bold text-[15px] mb-4">Historique des imports</p>

      <ul className="divide-y divide-hair">
        {batches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-3">
            <FileSpreadsheet className="size-4 text-ink-4 flex-none" />

            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium truncate">{b.fileName}</p>
              <p className="text-xs text-ink-4">
                {b.periodStart ? monthFmt.format(new Date(b.periodStart)) : "—"} ·{" "}
                {b.lineCount} lignes · {b.discrepancyCount} écarts ·{" "}
                {dateFmt.format(new Date(b.createdAt))}
              </p>
            </div>

            <Badge variant={importStatusTone[b.status]}>{importStatusLabel[b.status]}</Badge>

            {confirming === b.id ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ink-4">Sûr ?</span>
                <Button size="xs" variant="destructive" disabled={pending} onClick={() => undo(b.id)}>
                  Annuler l&apos;import
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>
                  Non
                </Button>
              </div>
            ) : (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Annuler cet import"
                onClick={() => setConfirming(b.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
