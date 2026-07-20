"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  collected: { label: "Encaissé", color: "#3ecf8e" },
  expected: { label: "Attendu (livré)", color: "#0f0f12" },
} satisfies ChartConfig;

export function CashTrendChart({
  data,
}: {
  data: { date: string; collected: number; expected: number }[];
}) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
      new Date(d.date),
    ),
  }));

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <LineChart data={formatted} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(15,15,18,.07)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#8a8a94" }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8a8a94" }} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="expected"
          stroke="var(--color-expected)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="collected"
          stroke="var(--color-collected)"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
