import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Search, Trophy, TrendingUp, Users, Award,
  ArrowUpDown, ChevronDown,
} from "lucide-react";
import { TrendDashboard } from "./TrendDashboard";

// ── Mock Data ──────────────────────────────────────────────────────────────────
const SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物"];

const STUDENTS = [
  { id: 1,  name: "赵超",   语文: 92, 数学: 95, 英语: 88, 物理: 90, 化学: 85, 生物: 54.5 },
  { id: 2,  name: "何冠森", 语文: 85, 数学: 90, 英语: 82, 物理: 87, 化学: 80, 生物: 55.5 },
  { id: 3,  name: "林晓雨", 语文: 78, 数学: 88, 英语: 90, 物理: 75, 化学: 82, 生物: 70  },
  { id: 4,  name: "张明宇", 语文: 88, 数学: 72, 英语: 76, 物理: 80, 化学: 78, 生物: 68  },
  { id: 5,  name: "陈思涵", 语文: 95, 数学: 85, 英语: 92, 物理: 70, 化学: 74, 生物: 60  },
  { id: 6,  name: "王浩然", 语文: 70, 数学: 65, 英语: 68, 物理: 72, 化学: 66, 生物: 58  },
  { id: 7,  name: "刘雅婷", 语文: 82, 数学: 79, 英语: 85, 物理: 78, 化学: 80, 生物: 75  },
  { id: 8,  name: "李俊杰", 语文: 60, 数学: 55, 英语: 62, 物理: 58, 化学: 60, 生物: 52  },
  { id: 9,  name: "吴佳欣", 语文: 88, 数学: 92, 英语: 80, 物理: 85, 化学: 88, 生物: 72  },
  { id: 10, name: "孙志远", 语文: 75, 数学: 80, 英语: 78, 物理: 82, 化学: 76, 生物: 65  },
];

const EXAMS = [
  { id: "mid-0509",  label: "期中考试 · 2026-05-09" },
  { id: "mid-2025",  label: "期末考试 · 2025-12-20" },
  { id: "mock-0301", label: "模拟考试 · 2026-03-01" },
];

const THRESHOLDS = { pass: 60, good: 75, excellent: 90 };

// ── Derived ────────────────────────────────────────────────────────────────────
function getTotal(s: (typeof STUDENTS)[0]) {
  return SUBJECTS.reduce((sum, sub) => sum + (s[sub as keyof typeof s] as number), 0);
}
function getGradeLabel(avg: number) {
  if (avg >= THRESHOLDS.excellent) return "优秀";
  if (avg >= THRESHOLDS.good)      return "良好";
  if (avg >= THRESHOLDS.pass)      return "及格";
  return "不及格";
}

const distributionData = [
  { label: "优秀 (≥90)",   color: "bg-emerald-400", count: 0 },
  { label: "良好 (75-89)", color: "bg-blue-400",    count: 0 },
  { label: "及格 (60-74)", color: "bg-amber-400",   count: 0 },
  { label: "不及格 (<60)", color: "bg-red-400",     count: 0 },
];
STUDENTS.forEach(s => {
  const avg = getTotal(s) / SUBJECTS.length;
  if      (avg >= 90) distributionData[0].count++;
  else if (avg >= 75) distributionData[1].count++;
  else if (avg >= 60) distributionData[2].count++;
  else                distributionData[3].count++;
});

const subjectAvgData = SUBJECTS.map(sub => ({
  subject: sub,
  avg: Math.round(STUDENTS.reduce((sum, s) => sum + (s[sub as keyof typeof s] as number), 0) / STUDENTS.length),
}));

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg shrink-0 ${accent}`}>{icon}</div>
        <span className="text-xs text-gray-400" style={{ fontWeight: 600 }}>{label}</span>
      </div>
      <p className="text-gray-900 leading-none" style={{ fontSize: "1.75rem", fontWeight: 700 }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── GradeBadge ─────────────────────────────────────────────────────────────────
function GradeBadge({ label, count, color }: { label: string; count: number; color: string }) {
  const pct = Math.round((count / STUDENTS.length) * 100);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
      <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-20 text-right shrink-0">
        {count} 人 ({pct}%)
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function GradesPage() {
  const [selectedExam, setSelectedExam] = useState(EXAMS[0]);
  const [selectedSubject, setSelectedSubject] = useState("总分");
  const [examOpen, setExamOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "trend">("single");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("total");
  const [sortAsc, setSortAsc] = useState(false);

  const studentsWithTotal = STUDENTS.map(s => ({
    ...s,
    total: getTotal(s),
    avg: Math.round((getTotal(s) / SUBJECTS.length) * 10) / 10,
  }));

  const filtered = [...studentsWithTotal]
    .filter(s => s.name.includes(searchQuery))
    .sort((a, b) => {
      const ak = (a as any)[sortKey] ?? 0;
      const bk = (b as any)[sortKey] ?? 0;
      return sortAsc ? ak - bk : bk - ak;
    });

  const totals       = studentsWithTotal.map(s => s.total);
  const maxTotal     = Math.max(...totals);
  const minTotal     = Math.min(...totals);
  const avgTotal     = Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10;
  const passCount    = studentsWithTotal.filter(s => s.avg >= THRESHOLDS.pass).length;
  const excellentCount = studentsWithTotal.filter(s => s.avg >= THRESHOLDS.excellent).length;

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div className="flex flex-col bg-gray-50 min-h-full">

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-wrap">
        {/* Exam selector */}
        <div className="relative">
          <button
            onClick={() => setExamOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            style={{ fontWeight: 600 }}
          >
            {selectedExam.label}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {examOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-10 overflow-hidden min-w-max">
              {EXAMS.map(exam => (
                <button
                  key={exam.id}
                  onClick={() => { setSelectedExam(exam); setExamOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${exam.id === selectedExam.id ? "text-blue-600 bg-blue-50" : "text-gray-700"}`}
                >
                  {exam.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subject pills */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
          {["总分", ...SUBJECTS].map(sub => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${selectedSubject === sub ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              style={{ fontWeight: selectedSubject === sub ? 700 : 500 }}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* View tabs */}
        <div className="ml-auto flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
          {(["single", "trend"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm transition-all ${activeTab === tab ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              style={{ fontWeight: activeTab === tab ? 700 : 500 }}
            >
              {tab === "single" ? "单次分析" : "各科趋势"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="p-6 flex flex-col gap-5">
        {activeTab === "single" ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                icon={<Users className="w-4 h-4 text-blue-600" />}
                label="参考人数"
                value={`${STUDENTS.length} 人`}
                sub="全部完成"
                accent="bg-blue-50"
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
                label="班级平均分"
                value={String(avgTotal)}
                sub={`满分 ${SUBJECTS.length * 100}`}
                accent="bg-violet-50"
              />
              <StatCard
                icon={<Trophy className="w-4 h-4 text-amber-600" />}
                label="最高 / 最低分"
                value={`${maxTotal} / ${minTotal}`}
                sub="总分区间"
                accent="bg-amber-50"
              />
              <StatCard
                icon={<Award className="w-4 h-4 text-emerald-600" />}
                label="优秀率"
                value={`${Math.round((excellentCount / STUDENTS.length) * 100)}%`}
                sub={`及格率 ${Math.round((passCount / STUDENTS.length) * 100)}%`}
                accent="bg-emerald-50"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-5 gap-4">
              {/* Bar chart — 3/5 width */}
              <div className="col-span-3 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-gray-700 mb-4">各科平均分对比</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={subjectAvgData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="subject" tick={{ fontSize: 13, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f9fafb" }} />
                    <Bar key="subject-bar-avg" dataKey="avg" name="平均分" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Grade breakdown — 2/5 width */}
              <div className="col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-gray-700 mb-1">成绩分布</h3>
                <p className="text-xs text-gray-400 mb-4">基于各科平均分</p>
                {distributionData.map(d => (
                  <GradeBadge key={d.label} label={d.label} count={d.count} color={d.color} />
                ))}
              </div>
            </div>

            {/* Student table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <h3 className="text-gray-700">学生成绩</h3>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜索学生姓名"
                    className="pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 w-44"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400" style={{ fontSize: "0.8125rem" }}>
                      <th className="text-left px-6 py-3 w-10">#</th>
                      <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort("name")}>
                        <span className="flex items-center gap-1">姓名 <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      {SUBJECTS.map(sub => (
                        <th key={sub} className="text-center px-4 py-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort(sub)}>
                          <span className="flex items-center justify-center gap-1">{sub} <ArrowUpDown className="w-3 h-3" /></span>
                        </th>
                      ))}
                      <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort("total")}>
                        <span className="flex items-center justify-center gap-1">总分 <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th className="text-center px-4 py-3">等级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((student, idx) => {
                      const rank = [...studentsWithTotal].sort((a, b) => b.total - a.total).findIndex(s => s.id === student.id) + 1;
                      const grade = getGradeLabel(student.avg);
                      const gradeColor = {
                        优秀:  "text-emerald-600 bg-emerald-50 border border-emerald-100",
                        良好:  "text-blue-600 bg-blue-50 border border-blue-100",
                        及格:  "text-amber-600 bg-amber-50 border border-amber-100",
                        不及格: "text-red-500 bg-red-50 border border-red-100",
                      }[grade];
                      return (
                        <tr key={student.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                          <td className="px-6 py-3 text-gray-300 tabular-nums">{rank}</td>
                          <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>{student.name}</td>
                          {SUBJECTS.map(sub => {
                            const score = student[sub as keyof typeof student] as number;
                            const color = score >= 90 ? "text-emerald-600" : score >= 75 ? "text-blue-600" : score >= 60 ? "text-gray-700" : "text-red-500";
                            return (
                              <td key={sub} className={`text-center px-4 py-3 tabular-nums ${color}`}>{score}</td>
                            );
                          })}
                          <td className="text-center px-4 py-3 tabular-nums text-gray-800" style={{ fontWeight: 700 }}>{student.total}</td>
                          <td className="text-center px-4 py-3">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full ${gradeColor}`}>{grade}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <TrendDashboard subjects={SUBJECTS} />
        )}
      </div>
    </div>
  );
}
