import { useCallback, useEffect, useMemo, useState } from "react";
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
  ArrowUpDown,
  ChevronDown,
  SlidersHorizontal,
  Download,
  Sparkles,
} from "lucide-react";

import { TrendDashboard } from "./TrendDashboard";
import { GradeExportModal } from "./GradeExportModal";
import { AnimatedPopover, Button, DialogPresence, SegmentedControl } from "./ui";
import { matchesStudentSearch, normalizeStudentSearch } from "../state/studentSearch";
import { DEFAULT_GRADE_THRESHOLDS, type GradeThresholds } from "../state/teacherWorkbench";
import { createCompetitionRankMap } from "../state/gradeRanking";
import type { AppStudent, GradeExam, GradeRow } from "../state/types";

const SUBJECT_COLORS = ["var(--app-chart-blue)", "var(--app-chart-violet)", "var(--app-chart-green)", "var(--app-chart-amber)", "var(--app-chart-cyan)", "var(--app-chart-pink)", "var(--app-chart-indigo)", "var(--app-chart-lime)"];
const GRADE_COLORS = {
  excellent: "var(--app-chart-green)",
  good: "var(--app-chart-blue)",
  pass: "var(--app-chart-amber)",
  fail: "var(--app-chart-rose)",
};

interface GradesPageProps {
  exams: GradeExam[];
  students: AppStudent[];
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  thresholds?: GradeThresholds;
  onThresholdsChange?: (next: GradeThresholds) => void;
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
  const previousRank = Number.parseInt(previous.rank || "", 10);
  const latestRank = Number.parseInt(latest.rank || "", 10);
  const rankDiff = Number.isFinite(previousRank) && Number.isFinite(latestRank) ? latestRank - previousRank : null;
  if (rankDiff === null || rankDiff <= 0) {
    return null;
  }
  const previousTotal = getStudentExamTotal(previous);
  const latestTotal = getStudentExamTotal(latest);
  const totalDiff = previousTotal !== null && latestTotal !== null ? Math.round((latestTotal - previousTotal) * 10) / 10 : null;
  const subjectDrop = Object.keys(latest.scores)
    .map(subject => {
      const before = previous.scores[subject];
      const after = latest.scores[subject];
      return Number.isFinite(before) && Number.isFinite(after) ? { subject, diff: Math.round((after - before) * 10) / 10 } : null;
    })
    .filter((item): item is { subject: string; diff: number } => Boolean(item))
    .sort((a, b) => a.diff - b.diff)[0];
  const reasons: string[] = [`排名退步 ${rankDiff} 名`];
  let score = rankDiff;
  if (totalDiff !== null && totalDiff < 0) {
    reasons.push(`总分变化 ${totalDiff}`);
    score += Math.min(Math.abs(totalDiff), 40) / 10;
  }
  if (subjectDrop && subjectDrop.diff <= -8) {
    reasons.push(`${subjectDrop.subject}变化 ${subjectDrop.diff}`);
  }
  return { reason: reasons.slice(0, 2).join(" · "), score, diff: -rankDiff };
}

function getGradeLabel(avg: number | null, thresholds: GradeThresholds) {
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

function getBandKey(value: number | null, thresholds: GradeThresholds): "excellent" | "good" | "pass" | "fail" | "missing" {
  if (value === null) return "missing";
  if (value >= thresholds.excellent) return "excellent";
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.pass) return "pass";
  return "fail";
}

function getMetricBandValue(row: GradeRow & { totalScore: number | null }, key: string, subjects: string[]): number | null {
  if (key !== "total") {
    return getMetricValue(row, key);
  }
  const total = row.totalScore;
  const fullScore = Math.max(1, subjects.length * 100);
  return total === null ? null : Math.round((total / fullScore) * 1000) / 10;
}

const EMPTY_SUBJECTS: string[] = [];
const EMPTY_ROWS: GradeExam["rows"] = [];

export function GradesPage({ exams, students, onSelectStudent, onOpenStudentFollowup, thresholds: thresholdsProp, onThresholdsChange }: GradesPageProps) {
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
  // 阈值受控优先（App 持久化到切片 settings）；无外部来源时退回本地状态。
  const [localThresholds, setLocalThresholds] = useState(DEFAULT_GRADE_THRESHOLDS);
  const thresholds = thresholdsProp ?? localThresholds;
  const setThresholds = (updater: (current: GradeThresholds) => GradeThresholds) => {
    const next = updater(thresholds);
    if (onThresholdsChange) onThresholdsChange(next);
    else setLocalThresholds(next);
  };

  const selectedExam = exams.find(exam => exam.id === selectedExamId) || exams[0];
  const subjects = selectedExam?.subjects || EMPTY_SUBJECTS;
  const trendSubjects = useMemo(
    () => Array.from(new Set(exams.flatMap(exam => exam.subjects))),
    [exams]
  );
  const visibleTrendSubjects = trendSubject === "all" || !trendSubjects.includes(trendSubject)
    ? trendSubjects
    : [trendSubject];
  const rows = selectedExam?.rows || EMPTY_ROWS;
  const metricKey = selectedSubject === "total" || subjects.includes(selectedSubject) ? selectedSubject : "total";
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const studentByName = useMemo(() => {
    const lookup = new Map<string, AppStudent>();
    students.forEach(student => {
      [student.name, ...student.aliases].forEach(name => {
        const normalized = normalizeName(name);
        if (normalized && !lookup.has(normalized)) {
          lookup.set(normalized, student);
        }
      });
    });
    return lookup;
  }, [students]);
  const rowMatchesSearch = useCallback((row: GradeRow) => {
    const student = (row.studentId ? studentById.get(row.studentId) : null) || studentByName.get(normalizeName(row.name));
    return student ? matchesStudentSearch(student, searchQuery) : normalizeStudentSearch(row.name).includes(normalizeStudentSearch(searchQuery));
  }, [searchQuery, studentById, studentByName]);

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

  const rowsWithMetrics = useMemo(() => rows.map(row => ({
    ...row,
    totalScore: getRowTotal(row),
    averageScore: getRowAverage(row, subjects),
  })), [rows, subjects]);
  // 总分排名一次算成查找表；此前每行渲染都复制整表排序，搜索时是 O(n²logn)。
  const rankById = useMemo(() => createCompetitionRankMap(rowsWithMetrics.map(row => ({ key: row.id, value: row.totalScore }))), [rowsWithMetrics]);
  const metricRankById = useMemo(() => createCompetitionRankMap(rowsWithMetrics.map(row => ({ key: row.id, value: getMetricValue(row, metricKey) }))), [metricKey, rowsWithMetrics]);
  const metricLabel = metricKey === "total" ? "全部" : metricKey;
  const fullScore = Math.max(1, subjects.length * 100);
  const totalThresholds = {
    pass: (thresholds.pass / 100) * fullScore,
    good: (thresholds.good / 100) * fullScore,
    excellent: (thresholds.excellent / 100) * fullScore,
  };
  const totalThresholdHint = `全部阈值：及格≥${formatThresholdValue(totalThresholds.pass)} / 良好≥${formatThresholdValue(totalThresholds.good)} / 优秀≥${formatThresholdValue(totalThresholds.excellent)}`;
  const subjectThresholdHint = `单科阈值：及格≥${thresholds.pass} / 良好≥${thresholds.good} / 优秀≥${thresholds.excellent}`;

  const filtered = useMemo(() => [...rowsWithMetrics]
    .filter(rowMatchesSearch)
    .sort((a, b) => {
      const av = sortKey === "name" ? a.name : sortKey === "total" ? a.totalScore : a.scores[sortKey]?.score ?? null;
      const bv = sortKey === "name" ? b.name : sortKey === "total" ? b.totalScore : b.scores[sortKey]?.score ?? null;
      return compareValues(av, bv, sortAsc);
    }), [rowMatchesSearch, rowsWithMetrics, sortAsc, sortKey]);

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
    const value = getMetricBandValue(row, metricKey, subjects);
    return value !== null && value >= thresholds.pass;
  }).length;
  const excellentCount = rowsWithMetrics.filter(row => {
    const value = getMetricBandValue(row, metricKey, subjects);
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
      count: rowsWithMetrics.filter(row => getBandKey(getMetricBandValue(row, metricKey, subjects), thresholds) === band.key).length,
    })),
  ];
  const subjectRankingRows = useMemo(() => [...rowsWithMetrics]
    .filter(rowMatchesSearch)
    .map(row => ({
      row,
      value: getMetricValue(row, metricKey),
      matchedStudent: (row.studentId ? studentById.get(row.studentId) : null) || studentByName.get(normalizeName(row.name)) || null,
    }))
    .filter(item => typeof item.value === "number" && Number.isFinite(item.value))
    .sort((a, b) => compareValues(a.value, b.value, false)), [metricKey, rowMatchesSearch, rowsWithMetrics, studentById, studentByName]);
  const trendFollowupCandidates = useMemo(() => students
    .map(student => {
      const signal = getTrendFollowupReason(student);
      return signal ? { student, ...signal } : null;
    })
    .filter((item): item is { student: AppStudent; reason: string; score: number; diff: number | null } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name, "zh-Hans-CN"))
    .slice(0, 6), [students]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(v => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const updateThreshold = (key: keyof GradeThresholds, value: number) => {
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
      <div className="h-full bg-background-primary-default p-6">
        <div className="bg-background-primary-default border border-separator-border rounded-2xl p-8 text-center text-text-tertiary">
          暂无考试数据
        </div>
      </div>
    );
  }

  return (
    <div className="grade-dashboard flex min-h-full flex-col bg-background-primary-default">
      <div className="grade-toolbar bg-background-primary-default border-b border-separator-border px-4 py-2.5" data-mode={activeTab}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 shrink basis-[240px]">
            <button
              type="button"
              aria-disabled={activeTab === "trend"}
              aria-haspopup={activeTab === "single" ? "listbox" : undefined}
              aria-expanded={activeTab === "single" ? examOpen : undefined}
              onClick={() => { if (activeTab === "single") setExamOpen(v => !v); }}
              className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-xl border px-3 text-body-regular text-text-primary transition-[background-color,border-color,box-shadow] duration-300 ${
                activeTab === "single"
                  ? "cursor-pointer border-border-button-default bg-background-primary-default hover:border-accent-200 hover:shadow-sm"
                  : "cursor-default border-accent-100 bg-accent-50/50"
              }`}
              style={{ fontWeight: 600 }}
            >
              <span key={activeTab} className="grade-toolbar-copy-enter min-w-0 flex-1 truncate text-left">
                {activeTab === "single"
                  ? `${selectedExam.name} · ${selectedExam.date || "未填写日期"}`
                  : `全部考试 · ${exams.length} 场趋势`}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-[opacity,transform] duration-300 ${activeTab === "single" ? "opacity-100" : "-translate-y-0.5 opacity-0"}`} />
            </button>
            <AnimatedPopover
              open={activeTab === "single" && examOpen}
              className="absolute left-0 top-full z-20 mt-1 min-w-72 max-w-96 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default shadow-lg"
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
                    className={`w-full truncate text-left px-4 py-2.5 text-body-regular hover:bg-background-secondary-default transition-colors ${exam.id === selectedExam.id ? "text-accent-600 bg-accent-50" : "text-text-primary"}`}
                  >
                    {exam.name} · {exam.date || "未填写日期"}
                  </button>
                ))}
            </AnimatedPopover>
          </div>

          <div className="ml-auto flex items-center gap-2">
          {activeTab === "single" ? (
          <div className="relative shrink-0">
            <Button size="sm" variant="secondary" aria-expanded={thresholdOpen} onClick={() => setThresholdOpen(v => !v)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />阈值设置
            </Button>

            <AnimatedPopover
              open={activeTab === "single" && thresholdOpen}
              className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-xl shadow-gray-200/70"
            >
                <div className="grid grid-cols-3 gap-3">
                  {(([
                    ["pass", "及格"],
                    ["good", "良好"],
                    ["excellent", "优秀"],
                  ]) as Array<[keyof GradeThresholds, string]>).map(([key, label]) => (
                    <label key={key} className="space-y-1.5 text-caption-1-regular text-text-secondary" style={{ fontWeight: 700 }}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={thresholds[key]}
                        onChange={event => updateThreshold(key, Number(event.target.value))}
                        className="h-9 w-full rounded-xl border border-border-button-default bg-background-primary-default px-2 text-center text-body-regular text-text-primary outline-none transition-colors focus:border-accent-300"
                        style={{ fontWeight: 800 }}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-3 truncate text-caption-1-regular text-text-tertiary">{metricKey === "total" ? totalThresholdHint : subjectThresholdHint}</p>
            </AnimatedPopover>
          </div>
          ) : (
            <span className="shrink-0 text-caption-1-regular text-text-tertiary">分数趋势展示 · 进退步按班排</span>
          )}

          <Button size="sm" variant="secondary" disabled={!exams.length} onClick={() => setExportOpen(true)} className="shrink-0">
            <Download className="h-3.5 w-3.5" />导出成绩
          </Button>

            <SegmentedControl
              value={activeTab}
              ariaLabel="成绩分析方式"
              onChange={value => setActiveTab(value as "single" | "trend")}
              options={[{ value: "single", label: "单次分析" }, { value: "trend", label: "多次趋势" }]}
              className="shrink-0"
            />
          </div>
        </div>

        <div className="mt-2 flex min-w-0 items-center overflow-x-auto">
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

      <div key={activeTab} className="view-switch-enter p-6 flex flex-col gap-5">
        {activeTab === "single" ? (
          <>
            <div className="grid grid-cols-4 divide-x divide-separator-border overflow-hidden rounded-xl border border-separator-border bg-background-primary-default">
              {[
                { label: "参考人数", value: `${rows.length} 人`, sub: `${subjects.length} 个科目` },
                { label: metricKey === "total" ? "班级平均分" : `${metricLabel}平均分`, value: formatScore(avgMetric ?? avgTotal), sub: `满分 ${metricKey === "total" ? subjects.length * 100 : 100}` },
                { label: "最高 / 最低分", value: `${formatScore(maxMetric ?? maxTotal)} / ${formatScore(minMetric ?? minTotal)}`, sub: `${metricLabel}区间` },
                { label: "优秀率", value: `${rows.length ? Math.round((excellentCount / rows.length) * 100) : 0}%`, sub: `及格率 ${rows.length ? Math.round((passCount / rows.length) * 100) : 0}%` },
              ].map(stat => (
                <div key={stat.label} className="min-w-0 px-4 py-3">
                  <div className="truncate text-caption-1-regular text-text-tertiary">{stat.label}</div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-headline-semibold tabular-nums text-text-primary">{stat.value}</span>
                    <span className="text-caption-1-regular text-text-tertiary">{stat.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className={`grade-chart-grid ${metricKey === "total" ? "grid grid-cols-5 gap-4" : "grid grid-cols-1 gap-4"}`}>
              <div className={`grade-main-chart surface-enter ${metricKey === "total" ? "col-span-3" : ""} rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm`}>
                <h3 className="text-text-primary mb-1">{metricKey === "total" ? "各科平均分对比" : `${metricLabel}分数分布`}</h3>
                <p className="text-caption-1-regular text-text-tertiary mb-4">
                  {metricKey === "total" ? "不同科目的班级平均表现" : `共 ${rows.length} 名学生的成绩区间分布`}
                </p>
                <ResponsiveContainer width="100%" height={metricKey === "total" ? 200 : 260}>
                  <BarChart data={metricKey === "total" ? subjectAvgData : distributionData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
                    <XAxis dataKey={metricKey === "total" ? "subject" : "label"} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis domain={metricKey === "total" ? [0, 100] : undefined} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--app-border)", fontSize: 13 }} cursor={{ fill: "var(--app-surface-muted)" }} />
                    <Bar key="main-chart-bar" dataKey={metricKey === "total" ? "avg" : "count"} name={metricKey === "total" ? "平均分" : "人数"} radius={[5, 5, 0, 0]}>
                      {(metricKey === "total" ? subjectAvgData : distributionData).map((item, index) => (
                        <Cell key={`main-cell-${index}`} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {metricKey === "total" && (
                <div className="grade-distribution-chart surface-enter col-span-2 rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm">
                  <h3 className="text-text-primary mb-1">全部分布</h3>
                  <p className="text-caption-1-regular text-text-tertiary mb-4">{totalThresholdHint}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distributionData} barSize={26}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--app-border)", fontSize: 13 }} cursor={{ fill: "var(--app-surface-muted)" }} />
                      <Bar dataKey="count" name="人数" radius={[5, 5, 0, 0]}>
                        {distributionData.map((item, index) => <Cell key={`dist-cell-${index}`} fill={item.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-background-primary-default rounded-2xl border border-separator-border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-separator-border">
                <div>
                  <h3 className="text-text-primary">{metricKey === "total" ? "学生成绩" : `${metricLabel} · 成绩排名`}</h3>
                  {metricKey !== "total" && <p className="text-caption-1-regular text-text-tertiary mt-0.5">按 {metricLabel} 成绩从高到低排列</p>}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜索学生姓名"
                    className="pl-8 pr-3 py-2 text-body-regular bg-background-primary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300 w-44"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                {metricKey === "total" ? (
                  <table className="w-full min-w-[940px] table-fixed text-body-regular">
                    <thead>
                      <tr className="bg-background-secondary-default text-text-tertiary" style={{ fontSize: "0.8125rem" }}>
                        <th className="text-left px-6 py-3 w-10">#</th>
                        <th className="text-left px-4 py-3 cursor-pointer hover:text-text-secondary" onClick={() => handleSort("name")}>
                          <span className="flex items-center gap-1">姓名 <ArrowUpDown className="w-3 h-3" /></span>
                        </th>
                        {subjects.map(subject => (
                          <th key={subject} className="text-center px-4 py-3 cursor-pointer hover:text-text-secondary" onClick={() => handleSort(subject)}>
                            <span className="flex items-center justify-center gap-1">{subject} <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                        ))}
                        <th className="text-center px-4 py-3 cursor-pointer hover:text-text-secondary" onClick={() => handleSort("total")}>
                          <span className="flex items-center justify-center gap-1">全部 <ArrowUpDown className="w-3 h-3" /></span>
                        </th>
                        <th className="w-[78px] whitespace-nowrap px-2 py-3 text-center">等级</th>
                        <th className="w-[84px] whitespace-nowrap px-2 py-3 text-center"><span className="block w-full text-center">AI</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(row => {
                        const matchedStudent = (row.studentId ? studentById.get(row.studentId) : null) || studentByName.get(normalizeName(row.name)) || null;
                        const rank = rankById.get(row.id);
                        const grade = getGradeLabel(getMetricBandValue(row, metricKey, subjects), thresholds);
                        const gradeColor = {
                          优秀: "text-status-success-600 bg-status-success-50 border border-status-success-100",
                          良好: "text-accent-600 bg-accent-50 border border-accent-100",
                          及格: "text-status-warning-600 bg-status-warning-50 border border-status-warning-100",
                          不及格: "text-status-danger-500 bg-status-danger-50 border border-status-danger-100",
                          缺考: "text-text-secondary bg-background-secondary-default border border-separator-border",
                        }[grade];
                        return (
                          <tr
                            key={row.id}
                            onClick={() => matchedStudent && onSelectStudent(matchedStudent)}
                            title={matchedStudent ? "点击查看学生详情" : "未匹配到学生档案"}
                            className={`border-t border-separator-border hover:bg-background-secondary-default/60 transition-colors ${matchedStudent ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-6 py-3 text-text-tertiary tabular-nums">{row.rankClass ?? rank ?? "—"}</td>
                            <td className="px-4 py-3 text-text-primary" style={{ fontWeight: 600 }}>{row.name}</td>
                            {subjects.map(subject => {
                              const score = row.scores[subject]?.score ?? null;
                              const color = score === null ? "text-text-tertiary" : score >= 90 ? "text-status-success-600" : score >= 75 ? "text-accent-600" : score >= 60 ? "text-text-primary" : "text-status-danger-500";
                              return (
                                <td key={subject} className={`text-center px-4 py-3 tabular-nums ${color}`}>{formatScore(score)}</td>
                              );
                            })}
                            <td className="text-center px-4 py-3 tabular-nums text-text-primary bg-accent-50/50" style={{ fontWeight: 700 }}>{formatScore(row.totalScore)}</td>
                            <td className="w-[78px] whitespace-nowrap px-2 py-3 text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption-1-regular ${gradeColor}`}>{grade}</span>
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
                                className="mx-auto inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-status-ai-100 bg-status-ai-50 px-2.5 text-caption-1-regular text-status-ai-600 transition-colors hover:bg-status-ai-100 disabled:border-separator-border disabled:bg-background-secondary-default disabled:text-text-tertiary"
                                style={{ fontWeight: 800 }}
                                title={matchedStudent ? "查看 AI 建议" : "未匹配到学生档案"}
                              >
                                <Sparkles className="h-3.5 w-3.5" />AI 建议
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[640px] table-fixed text-body-regular">
                    <thead>
                      <tr className="bg-background-secondary-default text-text-tertiary" style={{ fontSize: "0.8125rem" }}>
                        <th className="text-left px-6 py-3 w-16">排名</th>
                        <th className="text-left px-4 py-3">姓名</th>
                        <th className="text-center px-4 py-3">{metricLabel} 成绩</th>
                        <th className="w-[78px] whitespace-nowrap px-2 py-3 text-center">等级</th>
                        <th className="w-[84px] whitespace-nowrap px-2 py-3 text-center"><span className="block w-full text-center">AI</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectRankingRows.map(item => {
                        const grade = getGradeLabel(item.value, thresholds);
                        const gradeColor = {
                          优秀: "text-status-success-600 bg-status-success-50 border border-status-success-100",
                          良好: "text-accent-600 bg-accent-50 border border-accent-100",
                          及格: "text-status-warning-600 bg-status-warning-50 border border-status-warning-100",
                          不及格: "text-status-danger-500 bg-status-danger-50 border border-status-danger-100",
                          缺考: "text-text-secondary bg-background-secondary-default border border-separator-border",
                        }[grade];
                        return (
                          <tr
                            key={item.row.id}
                            onClick={() => item.matchedStudent && onSelectStudent(item.matchedStudent)}
                            title={item.matchedStudent ? "点击查看学生详情" : "未匹配到学生档案"}
                            className={`border-t border-separator-border hover:bg-background-secondary-default/60 transition-colors ${item.matchedStudent ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-6 py-3 text-text-tertiary tabular-nums">{item.row.scores[metricKey]?.rankClass ?? metricRankById.get(item.row.id) ?? "—"}</td>
                            <td className="px-4 py-3 text-text-primary" style={{ fontWeight: 600 }}>{item.row.name}</td>
                            <td className="text-center px-4 py-3 tabular-nums text-accent-700" style={{ fontWeight: 700 }}>{formatScore(item.value)}</td>
                            <td className="w-[78px] whitespace-nowrap px-2 py-3 text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption-1-regular ${gradeColor}`}>{grade}</span>
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
                                className="mx-auto inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-status-ai-100 bg-status-ai-50 px-2.5 text-caption-1-regular text-status-ai-600 transition-colors hover:bg-status-ai-100 disabled:border-separator-border disabled:bg-background-secondary-default disabled:text-text-tertiary"
                                style={{ fontWeight: 800 }}
                                title={item.matchedStudent ? "查看 AI 建议" : "未匹配到学生档案"}
                              >
                                <Sparkles className="h-3.5 w-3.5" />AI 建议
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
              <div className="surface-enter rounded-2xl border border-status-ai-100 bg-background-primary-default p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-text-primary" style={{ fontWeight: 900 }}>AI 跟进候选</h3>
                    <p className="mt-0.5 text-body-regular text-text-tertiary">按最近两次考试班排变化挑出需要先看的学生，分数仅作说明</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-status-ai-500" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {trendFollowupCandidates.map(item => (
                    <button
                      key={item.student.id}
                      onClick={() => onOpenStudentFollowup(item.student)}
                      className="group rounded-2xl border border-separator-border bg-background-secondary-default p-3 text-left transition-all hover:-translate-y-0.5 hover:border-status-ai-100 hover:bg-status-ai-50/60 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-body-regular text-text-primary" style={{ fontWeight: 900 }}>{item.student.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-caption-1-regular ${item.diff !== null && item.diff < 0 ? "bg-status-danger-50 text-status-danger-500" : "bg-background-tertiary-default text-text-tertiary"}`} style={{ fontWeight: 800 }}>
                          {item.diff !== null ? `↓${Math.abs(item.diff)}名` : "关注"}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-caption-1-regular leading-5 text-text-secondary">{item.reason}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-caption-1-regular text-status-ai-600 opacity-80 group-hover:opacity-100" style={{ fontWeight: 800 }}>
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
      <DialogPresence open={exportOpen}>
      {exportOpen && (
        <GradeExportModal
          exams={exams}
          students={students}
          onClose={() => setExportOpen(false)}
        />
      )}
      </DialogPresence>
    </div>
  );
}
