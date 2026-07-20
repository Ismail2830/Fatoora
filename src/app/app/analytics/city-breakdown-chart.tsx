"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { CityStat } from "@/lib/queries/analytics";

const config = {
  refusalRate: { label: "Taux de refus" },
} satisfies ChartConfig;

export function CityBreakdownChart({ cities }: { cities: CityStat[] }) {
  if (!cities.length) {
    return <p className="text-sm text-ink-4 py-8 text-center">Pas encore de données.</p>;
  }

  // Sorted by refusal rate for the chart specifically — the table below keeps
  // volume order, but this chart's whole point is spotting the worst cities.
  const sorted = [...cities].sort((a, b) => b.refusalRate - a.refusalRate).slice(0, 8);

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="rgba(15,15,18,.07)" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#8a8a94" }}
          unit="%"
        />
        <YAxis
          type="category"
          dataKey="city"
          tickLine={false}
          axisLine={false}
          width={90}
          tick={{ fontSize: 12, fill: "#4a4a55" }}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v) => `${Number(v).toFixed(0)}%`} />}
        />
        <Bar dataKey="refusalRate" radius={4}>
          {sorted.map((c) => (
            <Cell key={c.city} fill={c.refusalRate >= 30 ? "#ff8a9b" : "#7b5cf0"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
