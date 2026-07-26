import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatScore } from "./studentModalSelectors";

// 学生详情的成绩趋势折线图。保持独立模块并由 StudentModal 懒加载，
// recharts 只能留在异步 chunk，不得回到首屏入口（构建预算见 ARCHITECTURE.md）。
export default function StudentTrendChart({ data, metric }: {
  data: Array<Record<string, string | number | null>>;
  metric: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          labelFormatter={label => String(label || "")}
          formatter={(value) => [formatScore(typeof value === "number" ? value : null), metric === "total" ? "总分" : metric]}
          contentStyle={{ borderRadius: 12, border: "1px solid var(--app-border)", fontSize: 13 }}
        />
        <Line
          type="monotone"
          dataKey={metric}
          stroke="var(--app-primary)"
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: "var(--app-primary)", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "var(--app-primary-hover)", stroke: "var(--app-surface-muted)", strokeWidth: 3 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
