import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
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
  语文: "#3b82f6",
  数学: "#10b981",
  英语: "#8b5cf6",
  物理: "#f59e0b",
  化学: "#f43f5e",
  生物: "#06b6d4",
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

  return (
    <>
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-gray-700">多次考试趋势</h3>
            <p className="text-sm text-gray-400 mt-0.5">各科班级平均分随考试场次的变化</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end">
            {subjects.map(sub => (
              <span key={sub} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-4 h-0.5 rounded-full inline-block" style={{ background: SUBJECT_COLORS[sub] }} />
                {sub}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="exam" tick={{ fontSize: 13, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis domain={[55, 95]} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }}
              formatter={(value: number, name: string) => [`${value} 分`, name]}
            />
            {subjects.map(sub => (
              <Line
                key={`trend-line-${sub}`}
                type="monotone"
                dataKey={sub}
                stroke={SUBJECT_COLORS[sub] || "#64748b"}
                strokeWidth={2}
                dot={{ r: 4, fill: SUBJECT_COLORS[sub] || "#64748b" }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h3 className="text-gray-700">各场考试科目对比</h3>
          <p className="text-sm text-gray-400 mt-0.5">班级各科平均分，↑↓ 为较上次变化</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-400" style={{ fontSize: "0.8125rem" }}>
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
                  <tr key={sub} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SUBJECT_COLORS[sub] || "#64748b" }} />
                        <span className="text-gray-700" style={{ fontWeight: 600 }}>{sub}</span>
                      </div>
                    </td>
                    {vals.map((v, i) => {
                      const previous = i === 0 ? null : vals[i - 1];
                      const diff = v !== null && previous !== null ? Math.round((v - previous) * 10) / 10 : null;
                      return (
                        <td key={i} className="text-center px-6 py-3">
                          <span className="tabular-nums text-gray-800" style={{ fontWeight: 600 }}>{v ?? "—"}</span>
                          {diff !== null && (
                            <span className={`ml-1.5 text-xs tabular-nums ${diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-400" : "text-gray-400"}`}>
                              {diff > 0 ? `↑${diff}` : diff < 0 ? `↓${Math.abs(diff)}` : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-6 py-3">
                      <span className={`text-sm tabular-nums ${total === null ? "text-gray-300" : total > 0 ? "text-emerald-600" : total < 0 ? "text-red-500" : "text-gray-400"}`} style={{ fontWeight: 700 }}>
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
