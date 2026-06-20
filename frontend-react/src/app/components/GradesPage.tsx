import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Search,
  Trophy,
  TrendingUp,
  Users,
  Award,
  ArrowUpDown,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";

import { TrendDashboard } from "./TrendDashboard";
import type { AppStudent, GradeExam, GradeRow } from "../state/types";

const DEFAULT_THRESHOLDS = { pass: 60, good: 75, excellent: 90 };
const SUBJECT_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#06b6d4", "#ec4899", "#6366f1", "#84cc16"];
const GRADE_COLORS = {
  excellent: "#10b981",
  good: "#3b82f6",
  pass: "#f59e0b",
  fail: "#f43f5e",
};

type Thresholds = typeof DEFAULT_THRESHOLDS;

interface GradesPageProps {
  exams: GradeExam[];
  students: AppStudent[];
  onSelectStudent: (student: AppStudent) => void;
}

function getRowTotal(row: GradeRow): number | null {
  if (typeof row.total === "number" && Number.isFinite(row.total)) {
    return row.total;
  }

  let total = 0;
  let hasScore = false;
  Object.values(row.scores).forEach(cell => {
    if (typeof cell.score === "number" && Number.isFinite(cell.score)) {
      total += cell.score;
      hasScore = true;
    }
  });
  return hasScore ? Math.round(total * 10) / 10 : null;
}

function getMetricValue(row: GradeRow, key: string): number | null {
  if (key === "total") {
    return getRowTotal(row);
  }
  return row.scores[key]?.score ?? null;
}

function getRowAverage(row: GradeRow, subjects: string[]): number | null {
  const values = subjects
    .map(subject => row.scores[subject]?.score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function getGradeLabel(avg: number | null, thresholds: Thresholds) {
  if (avg === null) return "缺考";
  if (avg >= thresholds.excellent) return "优秀";
  if (avg >= thresholds.good) return "良好";
  if (avg >= thresholds.pass) return "及格";
  return "不及格";
}

function formatScore(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "—";
}

function formatThresholdValue(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function compareValues(a: string | number | null, b: string | number | null, asc: boolean): number {
  if (typeof a === "string" || typeof b === "string") {
    return asc ? String(a || "").localeCompare(String(b || ""), "zh-Hans-CN") : String(b || "").localeCompare(String(a || ""), "zh-Hans-CN");
  }
  const av = typeof a === "number" ? a : Number.NEGATIVE_INFINITY;
  const bv = typeof b === "number" ? b : Number.NEGATIVE_INFINITY;
  return asc ? av - bv : bv - av;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-Hans-CN");
}

function getBandKey(value: number | null, thresholds: Thresholds): "excellent" | "good" | "pass" | "fail" | "missing" {
  if (value === null) return "missing";
  if (value >= thresholds.excellent) return "excellent";
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.pass) return "pass";
  return "fail";
}

function getMetricBandValue(row: GradeRow & { totalScore: number | null }, key: string, subjects: string[], thresholds: Thresholds): number | null {
  if (key !== "total") {
    return getMetricValue(row, key);
  }
  const total = row.totalScore;
  const fullScore = Math.max(1, subjects.length * 100);
  return total === null ? null : Math.round((total / fullScore) * 1000) / 10;
}

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
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

export function GradesPage({ exams, students, onSelectStudent }: GradesPageProps) {
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id || "");
  const [selectedSubject, setSelectedSubject] = useState("total");
  const [examOpen, setExamOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "trend">("single");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  const selectedExam = exams.find(exam => exam.id === selectedExamId) || exams[0];
  const subjects = selectedExam?.subjects || [];
  const rows = selectedExam?.rows || [];
  const metricKey = selectedSubject === "total" || subjects.includes(selectedSubject) ? selectedSubject : "total";
  const studentById = new Map(students.map(student => [student.id, student]));
  const studentByName = new Map<string, AppStudent>();
  students.forEach(student => {
    [student.name, ...student.aliases].forEach(name => {
      const normalized = normalizeName(name);
      if (normalized && !studentByName.has(normalized)) {
        studentByName.set(normalized, student);
      }
    });
  });

  useEffect(() => {
    if (exams.length && !exams.some(exam => exam.id === selectedExamId)) {
      setSelectedExamId(exams[0].id);
      setSelectedSubject("total");
      setSortKey("total");
    }
  }, [exams, selectedExamId]);

  const rowsWithMetrics = rows.map(row => ({
    ...row,
    totalScore: getRowTotal(row),
    averageScore: getRowAverage(row, subjects),
  }));
  const metricLabel = metricKey === "total" ? "总分" : metricKey;
  const fullScore = Math.max(1, subjects.length * 100);
  const totalThresholds = {
    pass: (thresholds.pass / 100) * fullScore,
    good: (thresholds.good / 100) * fullScore,
    excellent: (thresholds.excellent / 100) * fullScore,
  };
  const totalThresholdHint = `总分阈值：及格≥${formatThresholdValue(totalThresholds.pass)} / 良好≥${formatThresholdValue(totalThresholds.good)} / 优秀≥${formatThresholdValue(totalThresholds.excellent)}`;
  const subjectThresholdHint = `单科阈值：及格≥${thresholds.pass} / 良好≥${thresholds.good} / 优秀≥${thresholds.excellent}`;

  const filtered = [...rowsWithMetrics]
    .filter(row => row.name.includes(searchQuery))
    .sort((a, b) => {
      const av = sortKey === "name" ? a.name : sortKey === "total" ? a.totalScore : a.scores[sortKey]?.score ?? null;
      const bv = sortKey === "name" ? b.name : sortKey === "total" ? b.totalScore : b.scores[sortKey]?.score ?? null;
      return compareValues(av, bv, sortAsc);
    });

  const totals = rowsWithMetrics
    .map(row => row.totalScore)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxTotal = totals.length ? Math.max(...totals) : null;
  const minTotal = totals.length ? Math.min(...totals) : null;
  const avgTotal = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null;
  const metricValues = rowsWithMetrics
    .map(row => getMetricValue(row, metricKey))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avgMetric = metricValues.length ? Math.round((metricValues.reduce((a, b) => a + b, 0) / metricValues.length) * 10) / 10 : null;
  const maxMetric = metricValues.length ? Math.max(...metricValues) : null;
  const minMetric = metricValues.length ? Math.min(...metricValues) : null;
  const passCount = rowsWithMetrics.filter(row => {
    const value = getMetricBandValue(row, metricKey, subjects, thresholds);
    return value !== null && value >= thresholds.pass;
  }).length;
  const excellentCount = rowsWithMetrics.filter(row => {
    const value = getMetricBandValue(row, metricKey, subjects, thresholds);
    return value !== null && value >= thresholds.excellent;
  }).length;
  const subjectAvgData = subjects.map((subject, index) => {
    const values = rows
      .map(row => row.scores[subject]?.score)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avg = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
    return { subject, avg, fill: SUBJECT_COLORS[index % SUBJECT_COLORS.length] };
  });
  const bandLabels = [
    { key: "excellent" as const, label: metricKey === "total" ? `优秀 (≥${formatThresholdValue(totalThresholds.excellent)})` : `优秀 (≥${thresholds.excellent})`, fill: GRADE_COLORS.excellent },
    { key: "good" as const, label: metricKey === "total" ? `良好 (≥${formatThresholdValue(totalThresholds.good)})` : `良好 (≥${thresholds.good})`, fill: GRADE_COLORS.good },
    { key: "pass" as const, label: metricKey === "total" ? `及格 (≥${formatThresholdValue(totalThresholds.pass)})` : `及格 (≥${thresholds.pass})`, fill: GRADE_COLORS.pass },
    { key: "fail" as const, label: metricKey === "total" ? `不及格 (<${formatThresholdValue(totalThresholds.pass)})` : `不及格 (<${thresholds.pass})`, fill: GRADE_COLORS.fail },
  ];
  const distributionData = [
    ...bandLabels.map(band => ({
      ...band,
      count: rowsWithMetrics.filter(row => getBandKey(getMetricBandValue(row, metricKey, subjects, thresholds), thresholds) === band.key).length,
    })),
  ];
  const rankingData = [...rowsWithMetrics]
    .map(row => ({
      name: row.name,
      value: getMetricValue(row, metricKey),
    }))
    .filter((item): item is { name: string; value: number } => typeof item.value === "number" && Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
    .map((item, index) => ({ ...item, rank: index + 1, fill: metricKey === "total" ? "#2563eb" : SUBJECT_COLORS[Math.max(0, subjects.indexOf(metricKey)) % SUBJECT_COLORS.length] }));

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(v => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const updateThreshold = (key: keyof Thresholds, value: number) => {
    setThresholds(current => {
      const next = { ...current, [key]: Math.max(0, Math.min(100, value || 0)) };
      if (key === "excellent" && next.excellent <= next.good) next.good = Math.max(0, next.excellent - 1);
      if (key === "good") {
        if (next.good >= next.excellent) next.excellent = Math.min(100, next.good + 1);
        if (next.good <= next.pass) next.pass = Math.max(0, next.good - 1);
      }
      if (key === "pass" && next.pass >= next.good) next.good = Math.min(100, next.pass + 1);
      return next;
    });
  };

  if (!selectedExam) {
    return (
      <div className="h-full bg-gray-50 p-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400">
          暂无考试数据
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setExamOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              style={{ fontWeight: 600 }}
            >
              {selectedExam.name} · {selectedExam.date || "未填写日期"}
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            {examOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-10 overflow-hidden min-w-max">
                {exams.map(exam => (
                  <button
                    key={exam.id}
                    onClick={() => {
                      setSelectedExamId(exam.id);
                      setExamOpen(false);
                      setSelectedSubject("total");
                      setSortKey("total");
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${exam.id === selectedExam.id ? "text-blue-600 bg-blue-50" : "text-gray-700"}`}
                  >
                    {exam.name} · {exam.date || "未填写日期"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto max-w-full">
            {["total", ...subjects].map(subject => (
              <button
                key={subject}
                onClick={() => {
                  setSelectedSubject(subject);
                  setSortKey(subject);
                  setSortAsc(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${metricKey === subject ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                style={{ fontWeight: metricKey === subject ? 700 : 500 }}
              >
                {subject === "total" ? "总分" : subject}
              </button>
            ))}
          </div>

          <button
            onClick={() => setThresholdOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
            style={{ fontWeight: 700 }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />统计阈值
          </button>

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

        {thresholdOpen && (
          <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <span className="text-xs text-gray-500" style={{ fontWeight: 700 }}>统计口径</span>
            {([
              ["pass", "及格"],
              ["good", "良好"],
              ["excellent", "优秀"],
            ] as Array<[keyof Thresholds, string]>).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-500">
                {label}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={thresholds[key]}
                  onChange={event => updateThreshold(key, Number(event.target.value))}
                  className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center outline-none focus:border-blue-300"
                />
              </label>
            ))}
            <p className="text-xs text-gray-400">{metricKey === "total" ? totalThresholdHint : subjectThresholdHint}</p>
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col gap-5">
        {activeTab === "single" ? (
          <>
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                icon={<Users className="w-4 h-4 text-blue-600" />}
                label="参考人数"
                value={`${rows.length} 人`}
                sub={`${subjects.length} 个科目`}
                accent="bg-blue-50"
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
                label={metricKey === "total" ? "班级平均分" : `${metricLabel}平均分`}
                value={formatScore(avgMetric ?? avgTotal)}
                sub={`满分 ${metricKey === "total" ? subjects.length * 100 : 100}`}
                accent="bg-violet-50"
              />
              <StatCard
                icon={<Trophy className="w-4 h-4 text-amber-600" />}
                label="最高 / 最低分"
                value={`${formatScore(maxMetric ?? maxTotal)} / ${formatScore(minMetric ?? minTotal)}`}
                sub={`${metricLabel}区间`}
                accent="bg-amber-50"
              />
              <StatCard
                icon={<Award className="w-4 h-4 text-emerald-600" />}
                label="优秀率"
                value={`${rows.length ? Math.round((excellentCount / rows.length) * 100) : 0}%`}
                sub={`及格率 ${rows.length ? Math.round((passCount / rows.length) * 100) : 0}%`}
                accent="bg-emerald-50"
              />
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-3 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-gray-700 mb-1">{metricKey === "total" ? "各科平均分对比" : `${metricLabel}分数分布`}</h3>
                <p className="text-xs text-gray-400 mb-4">
                  {metricKey === "total" ? "不同科目的班级平均表现" : "按当前统计阈值划分该科成绩段"}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={metricKey === "total" ? subjectAvgData : distributionData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey={metricKey === "total" ? "subject" : "label"} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis domain={metricKey === "total" ? [0, 100] : undefined} allowDecimals={false} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f9fafb" }} />
                    <Bar key="main-chart-bar" dataKey={metricKey === "total" ? "avg" : "count"} name={metricKey === "total" ? "平均分" : "人数"} radius={[5, 5, 0, 0]}>
                      {(metricKey === "total" ? subjectAvgData : distributionData).map((item, index) => (
                        <Cell key={`main-cell-${index}`} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-gray-700 mb-1">{metricKey === "total" ? "总分分布" : `${metricLabel}学生排名`}</h3>
                <p className="text-xs text-gray-400 mb-4">
                  {metricKey === "total" ? totalThresholdHint : `按${metricLabel}分数从高到低展示前 12 名`}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  {metricKey === "total" ? (
                    <BarChart data={distributionData} barSize={26}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f9fafb" }} />
                      <Bar dataKey="count" name="人数" radius={[5, 5, 0, 0]}>
                        {distributionData.map((item, index) => <Cell key={`dist-cell-${index}`} fill={item.fill} />)}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart data={rankingData} layout="vertical" barSize={10} margin={{ left: 12, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={52} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f9fafb" }} />
                      <Bar dataKey="value" name={metricLabel} radius={[0, 5, 5, 0]}>
                        {rankingData.map((item, index) => <Cell key={`rank-cell-${index}`} fill={item.fill} />)}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

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
                      {subjects.map(subject => (
                        <th key={subject} className="text-center px-4 py-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort(subject)}>
                          <span className="flex items-center justify-center gap-1">{subject} <ArrowUpDown className="w-3 h-3" /></span>
                        </th>
                      ))}
                      <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort("total")}>
                        <span className="flex items-center justify-center gap-1">总分 <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th className="text-center px-4 py-3">等级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, index) => {
                      const matchedStudent = (row.studentId ? studentById.get(row.studentId) : null) || studentByName.get(normalizeName(row.name)) || null;
                      const rank = [...rowsWithMetrics].sort((a, b) => compareValues(a.totalScore, b.totalScore, false)).findIndex(item => item.id === row.id) + 1;
                      const grade = getGradeLabel(getMetricBandValue(row, metricKey, subjects, thresholds), thresholds);
                      const gradeColor = {
                        优秀: "text-emerald-600 bg-emerald-50 border border-emerald-100",
                        良好: "text-blue-600 bg-blue-50 border border-blue-100",
                        及格: "text-amber-600 bg-amber-50 border border-amber-100",
                        不及格: "text-red-500 bg-red-50 border border-red-100",
                        缺考: "text-gray-500 bg-gray-50 border border-gray-100",
                      }[grade];
                      return (
                        <tr
                          key={row.id}
                          onClick={() => matchedStudent && onSelectStudent(matchedStudent)}
                          title={matchedStudent ? "点击查看学生详情" : "未匹配到学生档案"}
                          className={`border-t border-gray-50 hover:bg-gray-50/60 transition-colors ${matchedStudent ? "cursor-pointer" : ""}`}
                        >
                          <td className="px-6 py-3 text-gray-300 tabular-nums">{row.rankClass || rank || index + 1}</td>
                          <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>{row.name}</td>
                          {subjects.map(subject => {
                            const score = row.scores[subject]?.score ?? null;
                            const color = score === null ? "text-gray-300" : score >= 90 ? "text-emerald-600" : score >= 75 ? "text-blue-600" : score >= 60 ? "text-gray-700" : "text-red-500";
                            return (
                              <td key={subject} className={`text-center px-4 py-3 tabular-nums ${color} ${metricKey === subject ? "bg-blue-50/50" : ""}`}>{formatScore(score)}</td>
                            );
                          })}
                          <td className={`text-center px-4 py-3 tabular-nums text-gray-800 ${metricKey === "total" ? "bg-blue-50/50" : ""}`} style={{ fontWeight: 700 }}>{formatScore(row.totalScore)}</td>
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
          <TrendDashboard exams={exams} subjects={subjects} />
        )}
      </div>
    </div>
  );
}
