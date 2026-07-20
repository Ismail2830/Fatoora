"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatMAD } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductProfitability } from "@/lib/queries/products";
import { ProductDialog } from "./product-dialog";

export function ProductsTable({
  products,
  monoOnly,
}: {
  products: ProductProfitability[];
  monoOnly: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function toggleMono(next: boolean) {
    const q = new URLSearchParams(params.toString());
    if (next) q.delete("mono");
    else q.set("mono", "0");
    router.push(`/app/products?${q.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2.5 text-[13px] text-ink-3">
          <input
            type="checkbox"
            checked={monoOnly}
            onChange={(e) => toggleMono(e.target.checked)}
            className="size-4"
          />
          Commandes mono-produit uniquement
        </label>
        {!monoOnly && (
          <span className="flex items-center gap-1.5 text-xs text-warn-ink">
            <TriangleAlert className="size-3.5" />
            Frais répartis au prorata sur les commandes multi-produits — une estimation.
          </span>
        )}
      </div>

      {products.length === 0 ? (
        <div className="bg-surface border border-hair rounded-[18px] p-12 text-center">
          <p className="text-sm text-ink-4">Aucun produit. Ajoute ton premier produit.</p>
        </div>
      ) : (
        <div className="bg-surface border border-hair rounded-[18px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[12px] text-ink-4 border-b border-hair">
                  <Th className="pl-5">Produit</Th>
                  <Th className="text-right">Prix</Th>
                  <Th className="text-right">Marge unitaire</Th>
                  <Th className="text-right">Commandes</Th>
                  <Th className="text-right">Taux de refus</Th>
                  <Th className="text-right">Profit net</Th>
                  <Th className="text-right pr-5">Par commande</Th>
                  <Th className="pr-5" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-hair last:border-0 hover:bg-surface-muted">
                    <td className="py-3 pl-5 pr-3">
                      <p className="text-[13.5px] font-semibold leading-tight">{p.name}</p>
                      <p className="text-xs text-ink-4 font-mono mt-0.5">{p.sku}</p>
                      {!p.active && (
                        <Badge variant="secondary" className="mt-1">
                          Inactif
                        </Badge>
                      )}
                    </td>

                    <td className="py-3 pr-3 text-right font-mono text-[13px] tabular">
                      {formatMAD(p.sellPrice)}
                    </td>

                    <td className="py-3 pr-3 text-right font-mono text-[13px] tabular text-ink-3">
                      {formatMAD(p.nominalMarginPerUnit)}
                    </td>

                    <td className="py-3 pr-3 text-right text-[13px] tabular">
                      {p.ordersCount}
                    </td>

                    <td className="py-3 pr-3 text-right">
                      <RefusalRate rate={p.refusalRate} />
                    </td>

                    <td
                      className={cn(
                        "py-3 pr-3 text-right font-mono text-[13px] font-bold tabular",
                        p.netProfit < 0 ? "text-bad-ink" : "text-good-ink",
                      )}
                    >
                      {formatMAD(p.netProfit)}
                    </td>

                    <td
                      className={cn(
                        "py-3 pr-5 text-right font-mono text-[13px] tabular",
                        p.profitPerOrder < 0 ? "text-bad-ink" : "text-ink-3",
                      )}
                    >
                      {formatMAD(p.profitPerOrder)}
                    </td>

                    <td className="py-3 pr-5">
                      <ProductDialog mode="edit" product={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Past 30% and this is the pattern the whole page exists to surface. */
function RefusalRate({ rate }: { rate: number }) {
  const risky = rate >= 30;
  return (
    <span
      className={cn(
        "font-mono text-[13px] tabular",
        risky ? "text-bad-ink font-bold" : "text-ink-3",
      )}
    >
      {rate.toFixed(0)}%
    </span>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("font-medium py-2.5 pr-3", className)}>{children}</th>;
}
