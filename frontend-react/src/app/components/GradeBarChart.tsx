import { memo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { useBlendedColors } from "../hooks/useBlendedColors";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ChartAxisTick } from "./ChartAxisTick";

export interface HistogramDatum {
  label: string;
  range: string;
  count: number;
  bandLabel: string;
  fill: string;
}

interface AverageDatum {
  subject: string;
  avg: number;
  full: number;
  rate: number;
  fill: string;
}

function HistogramTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: HistogramDatum }> }) {
  const datum = active ? payload?.[0]?.payload : undefined;
  if (!datum) return null;
  return (
    <div className="rounded-[10px] border border-[var(--app-border)] bg-background-primary-default px-3 py-2 text-body-regular shadow-sm">
      <div className="tabular-nums text-text-secondary">{datum.range}</div>
      <div className="mt-0.5 text-text-primary"><span className="tabular-nums" style={{ fontWeight: 600 }}>{datum.count} 人</span> · {datum.bandLabel}</div>
    </div>
  );
}

// Colour frames stay inside the chart: they must not re-render the student table
// or restart ChartViewport's measurement while the card is changing size.
export const GradeBarChart = memo(function GradeBarChart({ width, height, data, structureKey, average = false, compact = false }: {
  width: number;
  height: number;
  data: AverageDatum[] | HistogramDatum[];
  structureKey: string;
  average?: boolean;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const fills = useBlendedColors(data.map(item => item.fill), structureKey, reducedMotion);
  // Numeric tick intervals bypass Recharts' DOM text measurements. These labels
  // use a fixed font and tabular digits; reserve their widest width plus the gap.
  const histogram = average ? [] : data as HistogramDatum[];
  const labelWidth = Math.max(0, ...histogram.map(item => item.label.length)) * (compact ? 11 : 12) * 0.65 + 8;
  const slotWidth = (width - 38) / Math.max(1, histogram.length);
  const ticks = histogram.filter((_item, index) => index === 0 || index === histogram.length - 1 || (index % Math.max(1, Math.ceil(labelWidth / slotWidth)) === 0 && (histogram.length - 1 - index) * slotWidth >= labelWidth)).map(item => item.label);
  return (
    <BarChart width={width} height={height} data={data} barSize={average ? 32 : undefined} barCategoryGap={average ? "10%" : 2}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
      <XAxis dataKey={average ? "subject" : "label"} ticks={average ? undefined : ticks} tick={<ChartAxisTick fontSize={compact ? 11 : 12} />} axisLine={false} tickLine={false} interval={0} minTickGap={8} />
      <YAxis interval={0} domain={average ? [0, 100] : undefined} unit={average ? "%" : undefined} allowDecimals={false} tick={<ChartAxisTick vertical percentage={average} />} axisLine={false} tickLine={false} width={average ? 40 : 28} />
      {average
        ? <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--app-border)", fontSize: 13 }} cursor={{ fill: "var(--app-surface-muted)" }} formatter={(value, _name, item) => [`${value}%（均分 ${item.payload.avg} / ${item.payload.full}）`, "平均得分率"]} />
        : <Tooltip content={<HistogramTooltip />} cursor={{ fill: "var(--app-surface-muted)" }} />}
      {/* Subject averages and score bins have no shared identity; keep their entrances local. */}
      <Bar isAnimationActive={!reducedMotion} animationDuration={320} animationEasing="ease-out" key={average ? "subject-bars" : "histogram-bars"} dataKey={average ? "rate" : "count"} name={average ? "平均得分率" : "人数"} radius={average ? [5, 5, 0, 0] : [3, 3, 0, 0]}>
        {fills.map((fill, index) => <Cell key={index} fill={fill} />)}
      </Bar>
    </BarChart>
  );
});
