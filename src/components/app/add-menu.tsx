"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, FileSpreadsheet, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddOrderSheet } from "./add-order-sheet";

/**
 * The single "get orders into Fatora" control, in the topbar.
 *
 * One button rather than competing "+ Commande" and "+ Importer": they occupy
 * the same mental slot, and merging them leaves room for the Shopify
 * integration later. It lives in the topbar because a WhatsApp order arrives
 * while you're on any screen — not conveniently while you're looking at
 * Commandes.
 */
export function AddMenu({ canImport = true }: { canImport?: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="pill">
            <Plus className="size-4" /> Ajouter
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => setSheetOpen(true)}>
            <MessageCircle className="size-4" />
            <span className="flex flex-col">
              <span className="font-medium">Une commande</span>
              <span className="text-xs text-muted-foreground">WhatsApp, DM ou téléphone</span>
            </span>
          </DropdownMenuItem>

          {canImport && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/import">
                  <FileSpreadsheet className="size-4" />
                  <span className="flex flex-col">
                    <span className="font-medium">Importer un fichier</span>
                    <span className="text-xs text-muted-foreground">CSV ou Excel</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AddOrderSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
