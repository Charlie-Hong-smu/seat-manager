import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrendDashboardProps {
  subjects: string[];
}

const EXAM_TREND = [
  { exam: "3月小考",  语文: 76, 数学: 72, 英语: 75, 物理: 69, 化学: 71, 生物: 62 },
  { exam: "期中考试", 语文: 80, 数学: 79, 英语: 79, 物理: 74, 化学: 76, 生物: 64 },
  { exam: "期末考试", 语文: 83, 数学: 82, 英语: 81, 物理: 77, 化学: 79, 生物: 67 },
];

const SUBJECT_COLORS: Record<string, string> = {
  语文: "#3b82f6",
  数学: "#10b981",
  英语: "#8b5cf6",
  物理: "#f59e0b",
  化学: "#f43f5e",
  生物: "#06b6d4",
};

export function TrendDashboard({ subjects }: TrendDashboardProps) {
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
          <LineChart data={EXAM_TREND} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                stroke={SUBJECT_COLORS[sub]}
                strokeWidth={2}
                dot={{ r: 4, fill: SUBJECT_COLORS[sub] }}
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
                {EXAM_TREND.map(e => (
                  <th key={e.exam} className="text-center px-6 py-3">{e.exam}</th>
                ))}
                <th className="text-center px-6 py-3">总变化</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map(sub => {
                const vals = EXAM_TREND.map(e => e[sub as keyof typeof e] as number);
                const total = vals[vals.length - 1] - vals[0];
                return (
                  <tr key={sub} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SUBJECT_COLORS[sub] }} />
                        <span className="text-gray-700" style={{ fontWeight: 600 }}>{sub}</span>
                      </div>
                    </td>
                    {vals.map((v, i) => {
                      const diff = i === 0 ? null : v - vals[i - 1];
                      return (
                        <td key={i} className="text-center px-6 py-3">
                          <span className="tabular-nums text-gray-800" style={{ fontWeight: 600 }}>{v}</span>
                          {diff !== null && (
                            <span className={`ml-1.5 text-xs tabular-nums ${diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-400" : "text-gray-400"}`}>
                              {diff > 0 ? `↑${diff}` : diff < 0 ? `↓${Math.abs(diff)}` : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-6 py-3">
                      <span className={`text-sm tabular-nums ${total > 0 ? "text-emerald-600" : total < 0 ? "text-red-500" : "text-gray-400"}`} style={{ fontWeight: 700 }}>
                        {total > 0 ? `+${total}` : total}
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
