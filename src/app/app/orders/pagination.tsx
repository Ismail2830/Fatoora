"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/orders-shared";

export function Pagination({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function goTo(next: number) {
    const query = new URLSearchParams(params.toString());
    if (next <= 1) query.delete("page");
    else query.set("page", String(next));
    router.push(`/app/orders?${query.toString()}`);
  }

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[13px] text-ink-4">
        {from}–{to} sur {total.toLocaleString("fr-FR")}
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          ← Précédent
        </Button>
        <span className="text-[13px] text-ink-3 tabular">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goTo(page + 1)}
        >
          Suivant →
        </Button>
      </div>
    </div>
  );
}
