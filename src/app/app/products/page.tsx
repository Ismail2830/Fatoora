import type { Metadata } from "next";

import { requireMoneyAccess } from "@/lib/session";
import { getProductProfitability } from "@/lib/queries/products";
import { ProductsTable } from "./products-table";
import { ProductDialog } from "./product-dialog";

export const metadata: Metadata = { title: "Produits — Fatora" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireMoneyAccess();
  const params = await searchParams;
  const monoOnly = params.mono !== "0";

  const products = await getProductProfitability(session.storeId, monoOnly);

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="display text-[34px] leading-tight">Produits</h1>
          <p className="text-[14.5px] text-ink-3">
            La rentabilité réelle, après retours et frais courier.
          </p>
        </div>
        <ProductDialog mode="create" />
      </header>

      <ProductsTable products={products} monoOnly={monoOnly} />
    </div>
  );
}
