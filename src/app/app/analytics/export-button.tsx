"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Period } from "@/lib/queries/analytics";

/**
 * A plain link, not a fetch: the browser's native download handling (the
 * Content-Disposition header) does the right thing without any JS-side blob
 * plumbing — this is the export the doc means by "for their accountant".
 */
export function ExportButton({ period }: { period: Period }) {
  return (
    <Button asChild variant="outline" size="pill">
      <a href={`/api/export/orders?period=${period}`} download>
        <Download className="size-4" /> Exporter
      </a>
    </Button>
  );
}
