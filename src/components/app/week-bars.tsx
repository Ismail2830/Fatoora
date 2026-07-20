"use client";

import { formatAmount } from "@/lib/money";

export type Bar = { day: string; amount: number };

/**
 * The design's bar chart: solid dark bars with the value floating on top.
 * Hand-rolled rather than pulled from a chart library — it's seven divs, and
 * a library would fight the styling harder than it would help.
 */
export function WeekBars({ bars }: { bars: Bar[] }) {
  const max = Math.max(...bars.map((b) => b.amount), 1);

  return (
    <div className="flex items-end gap-3.5 h-[190px] mt-5">
      {bars.map((bar, i) => {
        // Zero-value days still need a visible stub, or the row reads as a
        // rendering bug rather than "no money came in that day".
        const height = bar.amount > 0 ? Math.max((bar.amount / max) * 100, 8) : 3;

        return (
          <div
            key={`${bar.day}-${i}`}
            className="flex-1 flex flex-col items-center gap-2 h-full justify-end"
          >
            <div
              className="relative w-full bg-night rounded-[9px] transition-[height]"
              style={{ height: `${height}%` }}
            >
              {bar.amount > 0 && (
                <span className="absolute top-2 left-1/2 -translate-x-1/2 bg-white text-night font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap">
                  {formatAmount(bar.amount)}
                </span>
              )}
            </div>
            <span className="text-[12.5px] text-ink-4">{bar.day}</span>
          </div>
        );
      })}
    </div>
  );
}
