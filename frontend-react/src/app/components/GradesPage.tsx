import { useEffect, useMemo, useState } from "react";
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
  Download,
  Sparkles,
} from "lucide-react";

import { TrendDashboard } from "./TrendDashboard";
import { GradeExportModal } from "./GradeExportModal";
import { AnimatedPopover, SegmentedControl } from "./ui";
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
  onOpenStudentFollowup: (student: AppStudent) => void;
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

function getStudentExamTotal(exam: AppStudent["exams"][number]): number | null {
  if (typeof exam.total === "number" && Number.isFinite(exam.total)) {
    return Math.round(exam.total * 10) / 10;
  }
  const values = Object.values(exam.scores).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : null;
}

function getStudentExamSortValue(exam: AppStudent["exams"][number]): string {
  return `${exam.date || "9999-12-31"}-${exam.name}-${exam.id}`;
}

function getTrendFollowupReason(student: AppStudent): { reason: string; score: number; diff: number | null } | null {
  const exams = [...student.exams].sort((a, b) => getStudentExamSortValue(a).localeCompare(getStudentExamSortValue(b)));
  if (exams.length < 2) {
    return null;
  }
  const previous = exams[exams.length - 2];
  const latest = exams[exams.length - 1];
  const previousTotal = getStudentExamTotal(previous);
  const latestTotal = getStudentExamTotal(latest);
  const totalDiff = previousTotal !== null && latestTotal !== null ? Math.round((latestTotal - previousTotal) * 10) / 10 : null;
  const previousRank = Number.parseInt(previous.rank || "", 10);
  const latestRank = Number.parseInt(latest.rank || "", 10);
  const rankDiff = Number.isFinite(previousRank) && Number.isFinite(latestRank) ? latestRank - previousRank : null;
  const subjectDrop = Object.keys(latest.scores)
    .map(subject => {
      const before = previous.scores[subject];
      const after = latest.scores[subject];
      return Number.isFinite(before) && Number.isFinite(after) ? { subject, diff: Math.round((after - before) * 10) / 10 } : null;
    })
    .filter((item): item is { subject: string; diff: number } => Boolean(item))
    .sort((a, b) => a.diff - b.diff)[0];
  const reasons: string[] = [];
  let score = 0;
  if (totalDiff !== null && totalDiff < 0) {
    reasons.push(`总分下降 ${Math.abs(totalDiff)}`);
    score += Math.abs(totalDiff);
  }
  if (rankDiff !== null && rankDiff > 0) {
    reasons.push(`排名退步 ${rankDiff}`);
    score += Math.min(rankDiff, 80) / 2;
  }
  if (subjectDrop && subjectDrop.diff <= -8) {
    reasons.push(`${subjectDrop.subject}下降 ${Math.abs(subjectDrop.diff)}`);
    score += Math.abs(subjectDrop.diff);
  }
  if (!reasons.length) {
    return null;
  }
  return { reason: reasons.slice(0, 2).join(" · "), score, diff: totalDiff };
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
    <div className="surface-enter flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-gray-200 hover:shadow-md">
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

export function GradesPage({ exams, students, onSelectStudent, onOpenStudentFollowup }: GradesPageProps) {
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id || "");
  const [selectedSubject, setSelectedSubject] = useState("total");
  const [examOpen, setExamOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "trend">("single");
  const [trendSubject, setTrendSubject] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  const selectedExam = exams.find(exam => exam.id === selectedExamId) || exams[0];
  const subjects = selectedExam?.subjects || [];
  const trendSubjects = useMemo(
    () => Array.from(new Set(exams.flatMap(exam => exam.subjects))),
    [exams]
  );
  const visibleTrendSubjects = trendSubject === "all" || !trendSubjects.includes(trendSubject)
    ? trendSubjects
    : [trendSubject];
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

  useEffect(() => {
    if (activeTab === "trend") {
      setExamOpen(false);
      setThresholdOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (trendSubject !== "all" && !trendSubjects.includes(trendSubject)) {
      setTrendSubject("all");
    }
  }, [trendSubject, trendSubjects]);

  const rowsWithMetrics = rows.map(row => ({
    ...row,
    totalScore: getRowTotal(row),
    averageScore: getRowAverage(row, subjects),
  }));
  const metricLabel = metricKey === "total" ? "全部" : metricKey;
  const fullScore = Math.max(1, subjects.length * 100);
  const totalThresholds = {
    pass: (thresholds.pass / 100) * fullScore,
    good: (thresholds.good / 100) * fullScore,
    excellent: (thresholds.excellent / 100) * fullScore,
  };
  const totalThresholdHint = `全部阈值：及格≥${formatThresholdValue(totalThresholds.pass)} / 良好≥${formatThresholdValue(totalThresholds.good)} / 优秀≥${formatThresholdValue(totalThresholds.excellent)}`;
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
    { key: "fail" as const, label: metricKey === "total" ? `不及格 (<${formatThresholdValue(totalThresholds.pass)})` : `0-${Math.max(0, thresholds.pass - 1)}`, fill: GRADE_COLORS.fail },
    { key: "pass" as const, label: metricKey === "total" ? `及格 (≥${formatThresholdValue(totalThresholds.pass)})` : `${thresholds.pass}-${Math.max(thresholds.pass, thresholds.good - 1)}`, fill: GRADE_COLORS.pass },
    { key: "good" as const, label: metricKey === "total" ? `良好 (≥${formatThresholdValue(totalThresholds.good)})` : `${thresholds.good}-${Math.max(thresholds.good, thresholds.excellent - 1)}`, fill: GRADE_COLORS.good },
    { key: "excellent" as const, label: metricKey === "total" ? `优秀 (≥${formatThresholdValue(totalThresholds.excellent)})` : `${thresholds.excellent}+`, fill: GRADE_COLORS.excellent },
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
  const subjectRankingRows = [...rowsWithMetrics]
    .filter(row => row.name.includes(searchQuery))
    .map(row => ({
      row,
      value: getMetricValue(row, metricKey),
      matchedStudent: (row.studentId ? studentById.get(row.studentId) : null) || studentByName.get(normalizeName(row.name)) || null,
    }))
    .filter(item => typeof item.value === "number" && Number.isFinite(item.value))
    .sort((a, b) => compareValues(a.value, b.value, false));
  const trendFollowupCandidates = students
    .map(student => {
      const signal = getTrendFollowupReason(student);
      return signal ? { student, ...signal } : null;
    })
    .filter((item): item is { student: AppStudent; reason: string; score: number; diff: number | null } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name, "zh-Hans-CN"))
    .slice(0, 6);

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
    <div className="grade-dashboard flex min-h-full flex-col bg-gray-50">
      <div className="grade-toolbar bg-white border-b border-gray-100 px-6 py-3 space-y-3" data-mode={activeTab}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative min-w-0 shrink basis-[280px]">
            <button
              type="button"
              aria-disabled={activeTab === "trend"}
              aria-haspopup={activeTab === "single" ? "listbox" : undefined}
              aria-expanded={activeTab === "single" ? examOpen : undefined}
              onClick={() => { if (activeTab === "single") setExamOpen(v => !v); }}
              className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border px-3 text-sm text-gray-700 transition-[background-color,border-color,box-shadow] duration-300 ${
                activeTab === "single"
                  ? "cursor-pointer border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-white hover:shadow-sm"
                  : "cursor-default border-blue-100 bg-blue-50/50"
              }`}
              style={{ fontWeight: 600 }}
            >
              <span key={activeTab} className="grade-toolbar-copy-enter min-w-0 flex-1 truncate text-left">
                {activeTab === "single"
                  ? `${selectedExam.name} · ${selectedExam.date || "未填写日期"}`
                  : `全部考试 · ${exams.length} 场趋势`}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-[opacity,transform] duration-300 ${activeTab === "single" ? "opacity-100" : "-translate-y-0.5 opacity-0"}`} />
            </button>
            <AnimatedPopover
              open={activeTab === "single" && examOpen}
              className="absolute left-0 top-full z-20 mt-1 min-w-72 max-w-96 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
            >
                {exams.map(exam => (
                  <button
                    key={exam.id}
                    onClick={() => {
                      setSelectedExamId(exam.id);
                      setExamOpen(false);
                      setSelectedSubject("total");
                      setSortKey("total");
                    }}
                    className={`w-full truncate text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${exam.id === selectedExam.id ? "text-blue-600 bg-blue-50" : "text-gray-700"}`}
                  >
                    {exam.name} · {exam.date || "未填写日期"}
                  </button>
                ))}
            </AnimatedPopover>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <SegmentedControl
              value={activeTab === "single" ? metricKey : trendSubject}
              ariaLabel="成绩学科切换"
              onChange={subject => {
                if (activeTab === "single") {
                  setSelectedSubject(subject);
                  setSortKey(subject);
                  setSortAsc(false);
                } else {
                  setTrendSubject(subject);
                }
              }}
              options={(activeTab === "single" ? ["total", ...subjects] : ["all", ...trendSubjects]).map(subject => ({
                value: subject,
                label: subject === "total" || subject === "all" ? "全部" : subject,
              }))}
              className="grade-subject-switcher shrink-0"
            />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              aria-disabled={activeTab === "trend"}
              aria-haspopup={activeTab === "single" ? "dialog" : undefined}
              aria-expanded={activeTab === "single" ? thresholdOpen : undefined}
              onClick={() => { if (activeTab === "single") setThresholdOpen(v => !v); }}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs transition-[color,background-color,border-color] duration-300 ${
                activeTab === "single"
                  ? thresholdOpen
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  : "cursor-default border-gray-200 bg-gray-50 text-gray-400"
              }`}
              style={{ fontWeight: 700 }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span key={activeTab} className="grade-toolbar-copy-enter">
                {activeTab === "single" ? "阈值设置" : "趋势按原始分展示"}
              </span>
            </button>

            <AnimatedPopover
              open={activeTab === "single" && thresholdOpen}
              className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl shadow-gray-200/70"
            >
                <div className="grid grid-cols-3 gap-3">
                  {(([
                    ["pass", "及格"],
                    ["good", "良好"],
                    ["excellent", "优秀"],
                  ]) as Array<[keyof Thresholds, string]>).map(([key, label]) => (
                    <label key={key} className="space-y-1.5 text-xs text-gray-500" style={{ fontWeight: 700 }}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={thresholds[key]}
                        onChange={event => updateThreshold(key, Number(event.target.value))}
                        className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 px-2 text-center text-sm text-gray-900 outline-none transition-colors focus:border-blue-300 focus:bg-white"
                        style={{ fontWeight: 800 }}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-3 truncate text-xs text-gray-400">{metricKey === "total" ? totalThresholdHint : subjectThresholdHint}</p>
            </AnimatedPopover>
          </div>

          <button
            onClick={() => setExportOpen(true)}
            disabled={!exams.length}
            className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors disabled:opacity-50"
            style={{ fontWeight: 700 }}
          >
            <Download className="w-3.5 h-3.5" />导出成绩
          </button>

          <SegmentedControl
            value={activeTab}
            ariaLabel="成绩分析方式"
            onChange={value => setActiveTab(value as "single" | "trend")}
            options={[{ value: "single", label: "单次分析" }, { value: "trend", label: "多次趋势" }]}
            className="ml-auto shrink-0"
          />
        </div>
      </div>

      <div key={activeTab} className="view-switch-enter p-6 flex flex-col gap-5">
        {activeTab === "single" ? (
          <>
            <div className="grade-stat-grid grid grid-cols-4 gap-4">
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

            <div className={`grade-chart-grid ${metricKey === "total" ? "grid grid-cols-5 gap-4" : "grid grid-cols-1 gap-4"}`}>
              <div className={`grade-main-chart surface-enter ${metricKey === "total" ? "col-span-3" : ""} rounded-2xl border border-gray-100 bg-white p-5 shadow-sm`}>
                <h3 className="text-gray-700 mb-1">{metricKey === "total" ? "各科平均分对比" : `${metricLabel}分数分布`}</h3>
                <p className="text-xs text-gray-400 mb-4">
                  {metricKey === "total" ? "不同科目的班级平均表现" : `共 ${rows.length} 名学生的成绩区间分布`}
                </p>
                <ResponsiveContainer width="100%" height={metricKey === "total" ? 200 : 260}>
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

              {metricKey === "total" && (
                <div className="grade-distribution-chart surface-enter col-span-2 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-gray-700 mb-1">全部分布</h3>
                  <p className="text-xs text-gray-400 mb-4">{totalThresholdHint}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distributionData} barSize={26}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f9fafb" }} />
                      <Bar dataKey="count" name="人数" radius={[5, 5, 0, 0]}>
                        {distributionData.map((item, index) => <Cell key={`dist-cell-${index}`} fill={item.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <div>
                  <h3 className="text-gray-700">{metricKey === "total" ? "学生成绩" : `${metricLabel} · 成绩排名`}</h3>
                  {metricKey !== "total" && <p className="text-xs text-gray-400 mt-0.5">按 {metricLabel} 成绩从高到低排列</p>}
                </div>
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
                {metricKey === "total" ? (
                  <table className="w-full min-w-[940px] table-fixed text-sm">
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
                          <span className="flex items-center justify-center gap-1">全部 <ArrowUpDown className="w-3 h-3" /></span>
                        </th>
                        <th className="w-[78px] whitespace-nowrap px-2 py-3 text-center">等级</th>
                        <th className="w-[84px] whitespace-nowrap px-2 py-3 text-center"><span className="block w-full text-center">AI</span></th>
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
                                <td key={subject} className={`text-center px-4 py-3 tabular-nums ${color}`}>{formatScore(score)}</td>
                              );
                            })}
                            <td className="text-center px-4 py-3 tabular-nums text-gray-800 bg-blue-50/50" style={{ fontWeight: 700 }}>{formatScore(row.totalScore)}</td>
                            <td className="w-[78px] whitespace-nowrap px-2 py-3 text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${gradeColor}`}>{grade}</span>
                            </td>
                            <td className="w-[84px] whitespace-nowrap px-2 py-3 text-center">
                              <button
                                type="button"
                                disabled={!matchedStudent}
                                onClick={event => {
                                  event.stopPropagation();
                                  if (matchedStudent) {
                                    onOpenStudentFollowup(matchedStudent);
                                  }
                                }}
                                className="mx-auto inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-violet-100 bg-violet-50 px-2.5 text-xs text-violet-600 transition-colors hover:bg-violet-100 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
                                style={{ fontWeight: 800 }}
                                title={matchedStudent ? "打开 AI 跟进建议" : "未匹配到学生档案"}
                              >
                                <Sparkles className="h-3.5 w-3.5" />跟进
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[640px] table-fixed text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400" style={{ fontSize: "0.8125rem" }}>
                        <th className="text-left px-6 py-3 w-16">排名</th>
                        <th className="text-left px-4 py-3">姓名</th>
                        <th className="text-center px-4 py-3">{metricLabel} 成绩</th>
                        <th className="w-[78px] whitespace-nowrap px-2 py-3 text-center">等级</th>
                        <th className="w-[84px] whitespace-nowrap px-2 py-3 text-center"><span className="block w-full text-center">AI</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectRankingRows.map((item, index) => {
                        const grade = getGradeLabel(item.value, thresholds);
                        const gradeColor = {
                          优秀: "text-emerald-600 bg-emerald-50 border border-emerald-100",
                          良好: "text-blue-600 bg-blue-50 border border-blue-100",
                          及格: "text-amber-600 bg-amber-50 border border-amber-100",
                          不及格: "text-red-500 bg-red-50 border border-red-100",
                          缺考: "text-gray-500 bg-gray-50 border border-gray-100",
                        }[grade];
                        return (
                          <tr
                            key={item.row.id}
                            onClick={() => item.matchedStudent && onSelectStudent(item.matchedStudent)}
                            title={item.matchedStudent ? "点击查看学生详情" : "未匹配到学生档案"}
                            className={`border-t border-gray-50 hover:bg-gray-50/60 transition-colors ${item.matchedStudent ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-6 py-3 text-gray-400 tabular-nums">{index + 1}</td>
                            <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>{item.row.name}</td>
                            <td className="text-center px-4 py-3 tabular-nums text-blue-700" style={{ fontWeight: 700 }}>{formatScore(item.value)}</td>
                            <td className="w-[78px] whitespace-nowrap px-2 py-3 text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${gradeColor}`}>{grade}</span>
                            </td>
                            <td className="w-[84px] whitespace-nowrap px-2 py-3 text-center">
                              <button
                                type="button"
                                disabled={!item.matchedStudent}
                                onClick={event => {
                                  event.stopPropagation();
                                  if (item.matchedStudent) {
                                    onOpenStudentFollowup(item.matchedStudent);
                                  }
                                }}
                                className="mx-auto inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-violet-100 bg-violet-50 px-2.5 text-xs text-violet-600 transition-colors hover:bg-violet-100 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
                                style={{ fontWeight: 800 }}
                                title={item.matchedStudent ? "打开 AI 跟进建议" : "未匹配到学生档案"}
                              >
                                <Sparkles className="h-3.5 w-3.5" />跟进
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div key={visibleTrendSubjects.join("|") || "all"} className="grade-trend-subject-enter flex flex-col gap-5">
              <TrendDashboard exams={exams} subjects={visibleTrendSubjects} />
            </div>
            {trendFollowupCandidates.length > 0 && (
              <div className="surface-enter rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-gray-800" style={{ fontWeight: 900 }}>AI 跟进候选</h3>
                    <p className="mt-0.5 text-sm text-gray-400">根据最近两次考试变化自动挑出需要先看的学生</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-violet-500" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {trendFollowupCandidates.map(item => (
                    <button
                      key={item.student.id}
                      onClick={() => onOpenStudentFollowup(item.student)}
                      className="group rounded-2xl border border-gray-100 bg-gray-50 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-violet-100 hover:bg-violet-50/60 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-900" style={{ fontWeight: 900 }}>{item.student.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${item.diff !== null && item.diff < 0 ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"}`} style={{ fontWeight: 800 }}>
                          {item.diff !== null ? `${item.diff > 0 ? "+" : ""}${item.diff}` : "关注"}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{item.reason}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-violet-600 opacity-80 group-hover:opacity-100" style={{ fontWeight: 800 }}>
                        <Sparkles className="h-3.5 w-3.5" />打开跟进建议
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {exportOpen && (
        <GradeExportModal
          exams={exams}
          students={students}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
