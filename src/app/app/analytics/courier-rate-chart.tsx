"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { CourierRate } from "@/lib/queries/analytics";

const config = {
  deliveryRate: { label: "Taux de livraison" },
} satisfies ChartConfig;

export function CourierRateChart({ couriers }: { couriers: CourierRate[] }) {
  if (!couriers.length) {
    return <p className="text-sm text-ink-4 py-8 text-center">Pas encore de données.</p>;
  }

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={couriers} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
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
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={90}
          tick={{ fontSize: 12, fill: "#4a4a55" }}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v) => `${Number(v).toFixed(0)}%`} />}
        />
        <Bar dataKey="deliveryRate" radius={4}>
          {couriers.map((c) => (
            <Cell key={c.courierId} fill={c.deliveryRate >= 70 ? "#3ecf8e" : "#ffcf6b"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
