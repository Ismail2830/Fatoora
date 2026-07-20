"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireMoneyAccess } from "@/lib/session";

const productSchema = z.object({
  name: z.string().trim().min(2, "Nom requis."),
  sku: z.string().trim().min(1, "SKU requis."),
  costPrice: z.coerce.number().min(0, "Coût invalide."),
  sellPrice: z.coerce.number().min(0, "Prix invalide."),
  active: z.coerce.boolean().default(true),
});

export type ProductActionResult = { ok: true } | { ok: false; error: string };

export async function createProduct(formData: FormData): Promise<ProductActionResult> {
  const session = await requireMoneyAccess();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    costPrice: formData.get("costPrice"),
    sellPrice: formData.get("sellPrice"),
    active: formData.get("active") ?? true,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await db.product.findFirst({
    where: { storeId: session.storeId, sku: parsed.data.sku },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Ce SKU existe déjà." };

  await db.product.create({ data: { storeId: session.storeId, ...parsed.data } });

  revalidatePath("/app/products");
  return { ok: true };
}

export async function updateProduct(
  productId: string,
  formData: FormData,
): Promise<ProductActionResult> {
  const session = await requireMoneyAccess();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    costPrice: formData.get("costPrice"),
    sellPrice: formData.get("sellPrice"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const product = await db.product.findFirst({
    where: { id: productId, storeId: session.storeId },
    select: { id: true },
  });
  if (!product) return { ok: false, error: "Produit introuvable." };

  const dupe = await db.product.findFirst({
    where: { storeId: session.storeId, sku: parsed.data.sku, id: { not: productId } },
    select: { id: true },
  });
  if (dupe) return { ok: false, error: "Ce SKU existe déjà." };

  await db.product.update({ where: { id: productId }, data: parsed.data });

  revalidatePath("/app/products");
  return { ok: true };
}
