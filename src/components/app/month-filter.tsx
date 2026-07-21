"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function monthOptions(count: number) {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = i === 0 ? "Ce mois-ci" : `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

/**
 * Only "Encaissé ce mois" on the Dashboard reads this — every other tile is
 * live/current-state, so the picker is dashboard-only rather than a global
 * topbar control that would silently do nothing everywhere else.
 */
export function MonthFilter() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (pathname !== "/app") return null;

  const options = monthOptions(12);
  const current = searchParams.get("month") ?? options[0].value;
  const currentLabel = options.find((o) => o.value === current)?.label ?? options[0].label;

  function select(value: string) {
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (value === options[0].value) params.delete("month");
    else params.set("month", value);
    const qs = params.toString();
    router.push(qs ? `/app?${qs}` : "/app");
  }

  return (
    <div className="relative hidden lg:block" ref={ref}>
      <Button
        variant="outline"
        size="pill"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        📅 {currentLabel}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 max-h-72 overflow-y-auto rounded-[14px] bg-surface border border-hair shadow-lg py-1.5 z-20">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => select(o.value)}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-surface-muted ${
                o.value === current ? "font-semibold text-brand" : "text-ink-2"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
