import { ChartViewport } from "./ui";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { GradeExam } from "../state/types";

interface TrendDashboardProps {
  exams: GradeExam[];
  subjects: string[];
}

const SUBJECT_COLORS: Record<string, string> = {
  语文: "var(--app-chart-blue)",
  数学: "var(--app-chart-green)",
  英语: "var(--app-chart-violet)",
  物理: "var(--app-chart-amber)",
  化学: "var(--app-chart-rose)",
  生物: "var(--app-chart-cyan)",
};

function getSubjectAverage(exam: GradeExam, subject: string): number | null {
  const values = exam.rows
    .map(row => row.scores[subject]?.score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function TrendDashboard({ exams, subjects }: TrendDashboardProps) {
  const trendData = [...exams]
    .reverse()
    .map(exam => subjects.reduce<Record<string, string | number | null>>((row, subject) => {
      row[subject] = getSubjectAverage(exam, subject);
      return row;
    }, { exam: exam.name }));

  const reducedMotion = useReducedMotion();
  return (
    <>
      <div data-motion-surface="grade-main-chart" className="bg-background-primary-default rounded-2xl p-6 border border-separator-border shadow-sm">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-text-primary">多次考试趋势</h3>
            <p className="text-body-regular text-text-tertiary mt-0.5">各科班级平均分随考试场次的变化</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end">
            {subjects.map(sub => (
              <span key={sub} className="flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
                <span className="w-4 h-0.5 rounded-full inline-block" style={{ background: SUBJECT_COLORS[sub] }} />
                {sub}
              </span>
            ))}
          </div>
        </div>
        <ChartViewport height={280}>{(width, height) =>
          <LineChart width={width} height={height} data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
            <XAxis dataKey="exam" tick={{ fontSize: 13, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[55, 95]} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid var(--app-border)", fontSize: 13 }}
              formatter={(value: number, name: string) => [`${value} 分`, name]}
            />
            {subjects.map((sub, index) => (
              <Line isAnimationActive={!reducedMotion} animationDuration={320} animationEasing="ease-out"
                key={`trend-line-${index}`}
                type="monotone"
                dataKey={sub}
                stroke={SUBJECT_COLORS[sub] || "var(--app-chart-fallback)"}
                strokeWidth={2}
                dot={{ r: 4, fill: SUBJECT_COLORS[sub] || "var(--app-chart-fallback)" }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        }</ChartViewport>
      </div>

      <div className="bg-background-primary-default rounded-2xl border border-separator-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-separator-border">
          <h3 className="text-text-primary">各场考试科目对比</h3>
          <p className="text-body-regular text-text-tertiary mt-0.5">班级各科平均分，↑↓ 为较上次变化</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body-regular">
            <thead>
              <tr className="bg-background-secondary-default text-text-tertiary" style={{ fontSize: "0.8125rem" }}>
                <th className="text-left px-6 py-3">科目</th>
                {trendData.map(e => (
                  <th key={e.exam} className="text-center px-6 py-3">{e.exam}</th>
                ))}
                <th className="text-center px-6 py-3">总变化</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map(sub => {
                const vals = trendData.map(e => (typeof e[sub] === "number" ? e[sub] as number : null));
                const first = vals.find((value): value is number => value !== null);
                const last = [...vals].reverse().find((value): value is number => value !== null);
                const total = first !== undefined && last !== undefined ? Math.round((last - first) * 10) / 10 : null;
                return (
                  <tr key={sub} className="border-t border-separator-border hover:bg-background-secondary-default/60 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SUBJECT_COLORS[sub] || "var(--app-chart-fallback)" }} />
                        <span className="text-text-primary" style={{ fontWeight: 600 }}>{sub}</span>
                      </div>
                    </td>
                    {vals.map((v, i) => {
                      const previous = i === 0 ? null : vals[i - 1];
                      const diff = v !== null && previous !== null ? Math.round((v - previous) * 10) / 10 : null;
                      return (
                        <td key={i} className="text-center px-6 py-3">
                          <span className="tabular-nums text-text-primary" style={{ fontWeight: 600 }}>{v ?? "—"}</span>
                          {diff !== null && (
                            <span className={`ml-1.5 text-caption-1-regular tabular-nums ${diff > 0 ? "text-status-success-500" : diff < 0 ? "text-status-danger-400" : "text-text-tertiary"}`}>
                              {diff > 0 ? `↑${diff}` : diff < 0 ? `↓${Math.abs(diff)}` : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-6 py-3">
                      <span className={`text-body-regular tabular-nums ${total === null ? "text-text-tertiary" : total > 0 ? "text-status-success-600" : total < 0 ? "text-status-danger-500" : "text-text-tertiary"}`} style={{ fontWeight: 700 }}>
                        {total === null ? "—" : total > 0 ? `+${total}` : total}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
