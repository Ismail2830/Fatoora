"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AddOrderSheet } from "./add-order-sheet";

/**
 * The contextual twin of AddMenu: same sheet, but a plain button for places
 * where "add an order" is the obvious next action — the Commandes header and
 * the empty confirmation queue. The topbar menu stays the permanent home.
 */
export function AddOrderButton({
  label = "Nouvelle commande",
  variant = "default",
  size = "pill",
}: {
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {label}
      </Button>
      <AddOrderSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
