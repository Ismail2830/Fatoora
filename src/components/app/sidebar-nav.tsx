"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  /** Rendered as a red pill — used for the open-discrepancy count. */
  badge?: number;
};

/**
 * The reference design marks the active item with a coloured dot rather than
 * an icon, so the nav reads as a list of places rather than a toolbar.
 */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-[3px] flex-1">
      {items.map((item) => {
        // "/app" would otherwise match every child route.
        const active =
          item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-[11px] px-[11px] py-2.5 rounded-[11px] text-[14.5px] transition-colors",
              active
                ? "bg-brand-tint font-bold text-ink"
                : "font-medium text-ink-2 hover:bg-black/[0.04]",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-[3px] flex-none",
                active ? "bg-brand" : "bg-ink-4/40",
              )}
            />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="bg-bad-tint text-bad-ink text-[11px] font-bold px-[7px] py-0.5 rounded-full">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
