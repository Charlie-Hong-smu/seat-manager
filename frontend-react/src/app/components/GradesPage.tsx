import { useReducedMotion } from "../hooks/useReducedMotion";
import { useBlendedColors } from "../hooks/useBlendedColors";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
import { ChartViewport, Checkbox, MotionSwitch, AnimatedPopover, Button, DialogPresence, FadeSwap, InlineStatus, MotionCollapse, NumberStepper, RollingText, SegmentedControl, ToolPopover } from "./ui";
import { matchesStudentSearch, normalizeStudentSearch } from "../state/studentSearch";
import { DEFAULT_GRADE_THRESHOLDS, type GradeThresholdRates, type GradeThresholds } from "../state/teacherWorkbench";
import {
  GRADE_BAND_ORDER,
  RANK_BAND_LABELS,
  RANK_TIER_PERCENTS,
  SCORE_BAND_LABELS,
  buildScoreHistogram,
  countBands,
  formatScoreValue,
  getBandKey,
  getExamFullScores,
  getRankTierLines,
  getScoreBandLines,
  pickHistogramBinWidth,
  resolveThresholdRates,
  type GradeBandKey,
  type GradeBandLines,
  type GradeBandMode,
} from "../state/gradeBands";
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
  onFullScoresChange?: (examId: string, fullScores: Record<string, number>) => boolean;
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

const GRADE_BADGE_CLASSES: Record<GradeBandKey | "missing", string> = {
  excellent: "text-status-success-600 bg-status-success-50 border border-status-success-100",
  good: "text-accent-600 bg-accent-50 border border-accent-100",
  pass: "text-status-warning-600 bg-status-warning-50 border border-status-warning-100",
  fail: "text-status-danger-500 bg-status-danger-50 border border-status-danger-100",
  missing: "text-text-secondary bg-background-secondary-default border border-separator-border",
};
const SCORE_CELL_CLASSES: Record<GradeBandKey, string> = {
  excellent: "text-status-success-600",
  good: "text-accent-600",
  pass: "text-text-primary",
  fail: "text-status-danger-500",
};
const THRESHOLD_FIELDS: Array<[keyof GradeThresholdRates, string]> = [["pass", "及格"], ["good", "良好"], ["excellent", "优秀"]];
const THRESHOLD_TRIGGER_ID = "grade-threshold-trigger";

function ThresholdRows({ scopeLabel, rates, lines, onChange }: { scopeLabel: string; rates: GradeThresholdRates; lines: GradeBandLines | null; onChange: (key: keyof GradeThresholdRates, value: number) => void }) {
  return (
    <div className="space-y-2">
      {THRESHOLD_FIELDS.map(([key, label]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-body-medium text-text-secondary">{label}</span>
          <NumberStepper value={rates[key]} onChange={value => onChange(key, value)} min={0} max={100} ariaLabel={`${scopeLabel}${label}得分率`} />
          <span className="text-body-regular text-text-tertiary">%</span>
          {lines && <span className="ml-auto text-body-regular tabular-nums text-text-primary">≥ {formatScoreValue(lines[key])} 分</span>}
        </div>
      ))}
    </div>
  );
}

function GradeBadge({ band, labels }: { band: GradeBandKey | null; labels: Record<GradeBandKey, string> }) {
  const label = band ? labels[band] : "缺考";
  // 分档方式切换时底色平滑过渡，新旧标签同格交叉淡化。
  return <span className={`grade-badge inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption-1-regular ${GRADE_BADGE_CLASSES[band ?? "missing"]}`}><FadeSwap swapKey={label}>{label}</FadeSwap></span>;
}

function formatScore(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "—";
}

function orderThresholdRates(current: GradeThresholdRates, key: keyof GradeThresholdRates, value: number): GradeThresholdRates {
  const next = { pass: current.pass, good: current.good, excellent: current.excellent, [key]: Math.max(0, Math.min(100, value || 0)) };
  if (key === "excellent" && next.excellent <= next.good) next.good = Math.max(0, next.excellent - 1);
  if (key === "good") {
    if (next.good >= next.excellent) next.excellent = Math.min(100, next.good + 1);
    if (next.good <= next.pass) next.pass = Math.max(0, next.good - 1);
  }
  if (key === "pass" && next.pass >= next.good) next.good = Math.min(100, next.pass + 1);
  if (next.good <= next.pass) next.pass = Math.max(0, next.good - 1);
  return next;
}

function formatBandLines(lines: GradeBandLines): string {
  return `及格 ${formatScoreValue(lines.pass)} · 良好 ${formatScoreValue(lines.good)} · 优秀 ${formatScoreValue(lines.excellent)}`;
}

function BandSummary({ mode, counts, lines, labels, total }: { mode: GradeBandMode; counts: Record<GradeBandKey | "missing", number>; lines: GradeBandLines; labels: Record<GradeBandKey, string>; total: number }) {
  return (
    <div className="grade-band-summary-host mt-3">
    <ul aria-label="分档人数" className="grade-band-summary grid gap-2">
      {GRADE_BAND_ORDER.map(band => (
        <li key={band} className="min-w-0 rounded-lg bg-background-secondary-default px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: GRADE_COLORS[band] }} />
            <FadeSwap swapKey={mode} className="min-w-0 truncate text-caption-1-medium text-text-secondary">{labels[band]}</FadeSwap>
            <RollingText value={`${counts[band]}人`} className="ml-auto shrink-0 text-caption-1-semibold tabular-nums text-text-primary" />
          </div>
          <div className="mt-0.5 truncate pl-4 text-caption-1-regular tabular-nums text-text-tertiary">
            {band === "fail" ? "<" : "≥"}<RollingText value={formatScoreValue(band === "fail" ? lines.pass : lines[band])} />
            {total ? <> · <RollingText value={`${Math.round((counts[band] / total) * 100)}%`} /></> : null}
          </div>
        </li>
      ))}
    </ul>
    </div>
  );
}

function BandModeSwitch({ value, onChange }: { value: GradeBandMode; onChange: (value: GradeBandMode) => void }) {
  return <SegmentedControl value={value} onChange={onChange} ariaLabel="分档方式" className="shrink-0" options={[{ value: "score", label: "按分数线" }, { value: "rank", label: "按名次" }]} />;
}

interface HistogramDatum {
  label: string;
  range: string;
  count: number;
  bandLabel: string;
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

const EMPTY_SUBJECTS: string[] = [];
const EMPTY_ROWS: GradeExam["rows"] = [];

export function GradesPage({ exams, students, onSelectStudent, onOpenStudentFollowup, thresholds: thresholdsProp, onThresholdsChange, onFullScoresChange }: GradesPageProps) {
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id || "");
  const [selectedSubject, setSelectedSubject] = useState("total");
  const [examOpen, setExamOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "trend">("single");
  const [trendSubject, setTrendSubject] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [bandMode, setBandMode] = useState<GradeBandMode>("score");
  const [fullScoreError, setFullScoreError] = useState("");
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
  const reducedMotion = useReducedMotion();
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
  const subjectFullScores = useMemo(() => getExamFullScores({ rows, subjects, fullScores: selectedExam?.fullScores }), [rows, selectedExam?.fullScores, subjects]);
  const totalFullScore = Math.max(1, subjects.reduce((sum, subject) => sum + (subjectFullScores[subject] ?? 100), 0));
  const metricFullScore = metricKey === "total" ? totalFullScore : subjectFullScores[metricKey] ?? 100;
  const subjectRates = resolveThresholdRates(thresholds, "subject");
  const totalRates = resolveThresholdRates(thresholds, "total");
  const totalScoreLines = getScoreBandLines(totalRates, totalFullScore);
  const subjectLinesBySubject = Object.fromEntries(subjects.map(subject => [subject, getScoreBandLines(subjectRates, subjectFullScores[subject] ?? 100)]));
  const scoreLines = metricKey === "total" ? totalScoreLines : subjectLinesBySubject[metricKey] ?? getScoreBandLines(subjectRates, metricFullScore);

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
  const passCount = metricValues.filter(value => value >= scoreLines.pass).length;
  const excellentCount = metricValues.filter(value => value >= scoreLines.excellent).length;
  const subjectAvgData = subjects.map((subject, index) => {
    const values = rows
      .map(row => row.scores[subject]?.score)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avg = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
    const full = subjectFullScores[subject] ?? 100;
    return { subject, avg, full, rate: Math.round((avg / full) * 1000) / 10, fill: SUBJECT_COLORS[index % SUBJECT_COLORS.length] };
  });
  // 名次分层只改变分档方式；优秀率/及格率始终按得分率阈值统计。
  const rankLines = getRankTierLines(metricValues);
  const bandLines = bandMode === "rank" && rankLines ? rankLines : scoreLines;
  const bandLabels = bandMode === "rank" ? RANK_BAND_LABELS : SCORE_BAND_LABELS;
  const bandCounts = countBands(rowsWithMetrics.map(row => getMetricValue(row, metricKey)), bandLines);
  const histogramBinWidth = pickHistogramBinWidth(metricFullScore);
  // 两种分档方式的分界线都参与切分，切换时柱形不变、只换颜色。
  const histogramBins = buildScoreHistogram(metricValues, metricFullScore, bandLines, [scoreLines, rankLines].flatMap(lines => lines ? [lines.pass, lines.good, lines.excellent] : []));
  const histogramFills = useBlendedColors(histogramBins.map(bin => GRADE_COLORS[bin.band]), `${selectedExam?.id}-${metricKey}-${histogramBins.map(bin => bin.from).join(",")}`, reducedMotion);
  const distributionData: HistogramDatum[] = histogramBins.map((bin, index) => ({
    label: formatScoreValue(bin.from),
    range: `${formatScoreValue(bin.from)} ≤ 分数 ${bin.inclusiveEnd ? "≤" : "<"} ${formatScoreValue(bin.to)}`,
    count: bin.count,
    bandLabel: bandLabels[bin.band],
    fill: histogramFills[index],
  }));
  const distributionHint = bandMode === "rank"
    ? `按名次：前${RANK_TIER_PERCENTS.top}% / 前${RANK_TIER_PERCENTS.upper}% / 后${RANK_TIER_PERCENTS.bottom}%，同分同层`
    : `满分 ${formatScoreValue(metricFullScore)} · 每格 ${histogramBinWidth} 分`;
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

  const updateThreshold = (scope: "subject" | "total", key: keyof GradeThresholdRates, value: number) => {
    setThresholds(current => scope === "total"
      ? { ...resolveThresholdRates(current, "subject"), total: orderThresholdRates(resolveThresholdRates(current, "total"), key, value) }
      : { ...orderThresholdRates(current, key, value), ...(current.total ? { total: current.total } : {}) });
  };
  const setTotalIndependent = (independent: boolean) => {
    setThresholds(current => {
      const subjectOnly = resolveThresholdRates(current, "subject");
      return independent ? { ...subjectOnly, total: subjectOnly } : subjectOnly;
    });
  };
  const updateFullScore = (subject: string, value: number) => {
    if (!onFullScoresChange || !selectedExam) return;
    const saved = onFullScoresChange(selectedExam.id, { ...subjectFullScores, [subject]: value });
    setFullScoreError(saved ? "" : "这场考试来自旧版学生档案，无法单独保存满分；重新导入后即可设置。");
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
              <MotionSwitch transitionKey={`${activeTab}-${selectedExam.id}`} direction={activeTab === "trend" ? "right" : "left"} className="min-w-0 flex-1 text-left [--motion-surface:transparent]" contentClassName="truncate">
                {activeTab === "single"
                  ? `${selectedExam.name} · ${selectedExam.date || "未填写日期"}`
                  : `全部考试 · ${exams.length} 场趋势`}
              </MotionSwitch>
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
          <MotionSwitch transitionKey={activeTab} direction={activeTab === "trend" ? "right" : "left"} className="shrink-0" contentClassName="flex items-center">
          {activeTab === "single" ? (
          <div className="relative shrink-0">
            <Button id={THRESHOLD_TRIGGER_ID} size="sm" variant="secondary" aria-haspopup="dialog" aria-expanded={thresholdOpen} onClick={() => setThresholdOpen(v => !v)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />阈值设置
            </Button>
          </div>
          ) : (
            <span className="shrink-0 px-1 text-caption-1-regular text-text-tertiary">分数趋势展示 · 进退步按班排</span>
          )}
          </MotionSwitch>

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

        <div className="mt-2 flex min-w-0 items-center gap-3 overflow-x-auto">
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
          <MotionSwitch transitionKey={activeTab} direction={activeTab === "trend" ? "right" : "left"} className="ml-auto shrink-0" contentClassName="flex items-center">
            {activeTab === "single" ? <BandModeSwitch value={bandMode} onChange={setBandMode} /> : null}
          </MotionSwitch>
        </div>
      </div>

      <MotionSwitch transitionKey={activeTab} direction={activeTab === "trend" ? "right" : "left"} sharedLayout contentClassName="grade-content p-6 flex flex-col gap-5">
        {activeTab === "single" ? (
          <>
            <div className="grade-stat-grid grid grid-cols-4 divide-x divide-separator-border overflow-hidden rounded-xl border border-separator-border bg-background-primary-default">
              {[
                { id: "count", label: "参考人数", value: `${rows.length} 人`, sub: `${subjects.length} 个科目` },
                { id: "avg", label: metricKey === "total" ? "班级平均分" : `${metricLabel}平均分`, value: formatScore(avgMetric ?? avgTotal), sub: `满分 ${formatScoreValue(metricFullScore)}` },
                { id: "range", label: "最高 / 最低分", value: `${formatScore(maxMetric ?? maxTotal)} / ${formatScore(minMetric ?? minTotal)}`, sub: `${metricLabel}区间` },
                { id: "rate", label: "优秀率", value: `${rows.length ? Math.round((excellentCount / rows.length) * 100) : 0}%`, sub: `及格率 ${rows.length ? Math.round((passCount / rows.length) * 100) : 0}%` },
              ].map(stat => (
                <div key={stat.id} className="min-w-0 px-4 py-3">
                  <div className="truncate text-caption-1-regular text-text-tertiary">{stat.label}</div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <RollingText value={stat.value} className="text-headline-semibold tabular-nums text-text-primary" />
                    <RollingText value={stat.sub} className="text-caption-1-regular text-text-tertiary" />
                  </div>
                </div>
              ))}
            </div>

            <MotionSwitch sharedLayout preserveContent transitionKey={`${selectedExam.id}-${metricKey}`} className="grade-chart-transition">
            <div className="grade-chart-grid grid gap-4" data-split={metricKey === "total" ? "true" : "false"}>
              <div data-motion-surface="grade-main-chart" className="grade-main-chart flex min-w-0 flex-col rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm">
                <h3 className="text-text-primary mb-1">{metricKey === "total" ? "各科平均得分率" : `${metricLabel}分数分布`}</h3>
                <p className="mb-4 text-caption-1-regular text-text-tertiary">{metricKey === "total" ? "平均分 ÷ 该科满分，满分不同的科目也能直接比较" : <FadeSwap swapKey={bandMode}>{distributionHint}</FadeSwap>}</p>
                <ChartViewport height={metricKey === "total" ? "fill" : 240}>{(width, height) =>
                  <BarChart width={width} height={height} data={metricKey === "total" ? subjectAvgData : distributionData} barSize={metricKey === "total" ? 32 : undefined} barCategoryGap={metricKey === "total" ? "10%" : 2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
                    <XAxis dataKey={metricKey === "total" ? "subject" : "label"} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} interval={metricKey === "total" ? 0 : "preserveStartEnd"} minTickGap={8} />
                    <YAxis domain={metricKey === "total" ? [0, 100] : undefined} unit={metricKey === "total" ? "%" : undefined} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} width={metricKey === "total" ? 40 : 28} />
                    {metricKey === "total"
                      ? <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--app-border)", fontSize: 13 }} cursor={{ fill: "var(--app-surface-muted)" }} formatter={(value, _name, item) => [`${value}%（均分 ${item.payload.avg} / ${item.payload.full}）`, "平均得分率"]} />
                      : <Tooltip content={<HistogramTooltip />} cursor={{ fill: "var(--app-surface-muted)" }} />}
                    {/* 科目均值与分数分箱没有对应关系：切换时柱形原位升起，不让旧柱横向滑进新分箱。 */}
                    <Bar isAnimationActive={!reducedMotion} animationDuration={320} animationEasing="ease-out" key={metricKey === "total" ? "main-chart-subject-bars" : "main-chart-histogram-bars"} dataKey={metricKey === "total" ? "rate" : "count"} name={metricKey === "total" ? "平均得分率" : "人数"} radius={metricKey === "total" ? [5, 5, 0, 0] : [3, 3, 0, 0]}>
                      {(metricKey === "total" ? subjectAvgData : distributionData).map((item, index) => (
                        <Cell key={`main-cell-${index}`} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                }</ChartViewport>
                {metricKey !== "total" && <BandSummary mode={bandMode} counts={bandCounts} lines={bandLines} labels={bandLabels} total={metricValues.length} />}
              </div>

              {metricKey === "total" && <div className="grade-distribution-chart min-w-0 overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm">
                <h3 className="text-text-primary mb-1">总分分布</h3>
                <p className="mb-4 text-caption-1-regular text-text-tertiary"><FadeSwap swapKey={bandMode}>{distributionHint}</FadeSwap></p>
                <ChartViewport height={200}>{(width, height) =>
                  <BarChart width={width} height={height} data={distributionData} barCategoryGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--app-chart-axis)" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<HistogramTooltip />} cursor={{ fill: "var(--app-surface-muted)" }} />
                    <Bar isAnimationActive={!reducedMotion} animationDuration={320} animationEasing="ease-out" dataKey="count" name="人数" radius={[3, 3, 0, 0]}>
                      {distributionData.map((item, index) => <Cell key={`dist-cell-${index}`} fill={item.fill} />)}
                    </Bar>
                  </BarChart>
                }</ChartViewport>
                <BandSummary mode={bandMode} counts={bandCounts} lines={bandLines} labels={bandLabels} total={metricValues.length} />
              </div>}
            </div>
            </MotionSwitch>

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
                        <th className="w-[78px] whitespace-nowrap px-2 py-3 text-center">{bandMode === "rank" ? "层次" : "等级"}</th>
                        <th className="w-[84px] whitespace-nowrap px-2 py-3 text-center"><span className="block w-full text-center">AI</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(row => {
                        const matchedStudent = (row.studentId ? studentById.get(row.studentId) : null) || studentByName.get(normalizeName(row.name)) || null;
                        const rank = rankById.get(row.id);
                        return (
                          <tr
                            key={row.id}
                            onClick={() => matchedStudent && onSelectStudent(matchedStudent)}
                            title={matchedStudent ? "点击查看学生详情" : "未匹配到学生档案"}
                            className={`border-t border-separator-border hover:bg-background-secondary-default/60 transition-colors ${matchedStudent ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-6 py-3 text-text-tertiary tabular-nums"><RollingText value={String(row.rankClass ?? rank ?? "—")} /></td>
                            <td className="px-4 py-3 text-text-primary" style={{ fontWeight: 600 }}>{row.name}</td>
                            {subjects.map(subject => {
                              const score = row.scores[subject]?.score ?? null;
                              const band = getBandKey(score, subjectLinesBySubject[subject]);
                              const color = band ? SCORE_CELL_CLASSES[band] : "text-text-tertiary";
                              return (
                                <td key={subject} className={`text-center px-4 py-3 tabular-nums ${color}`}>{formatScore(score)}</td>
                              );
                            })}
                            <td className="text-center px-4 py-3 tabular-nums text-text-primary bg-accent-50/50" style={{ fontWeight: 700 }}><RollingText value={formatScore(row.totalScore)} /></td>
                            <td className="w-[78px] whitespace-nowrap px-2 py-3 text-center">
                              <GradeBadge band={getBandKey(row.totalScore, bandLines)} labels={bandLabels} />
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
                                className="mx-auto inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] px-2.5 text-caption-1-semibold text-text-secondary transition-colors hover:bg-background-secondary-default hover:text-text-primary disabled:text-text-tertiary"
                                title={matchedStudent ? "查看 AI 建议" : "未匹配到学生档案"}
                              >
                                <Sparkles className="h-3.5 w-3.5 text-status-ai-500" />AI 建议
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
                        <th className="w-[78px] whitespace-nowrap px-2 py-3 text-center">{bandMode === "rank" ? "层次" : "等级"}</th>
                        <th className="w-[84px] whitespace-nowrap px-2 py-3 text-center"><span className="block w-full text-center">AI</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectRankingRows.map(item => {
                        return (
                          <tr
                            key={item.row.id}
                            onClick={() => item.matchedStudent && onSelectStudent(item.matchedStudent)}
                            title={item.matchedStudent ? "点击查看学生详情" : "未匹配到学生档案"}
                            className={`border-t border-separator-border hover:bg-background-secondary-default/60 transition-colors ${item.matchedStudent ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-6 py-3 text-text-tertiary tabular-nums"><RollingText value={String(item.row.scores[metricKey]?.rankClass ?? metricRankById.get(item.row.id) ?? "—")} /></td>
                            <td className="px-4 py-3 text-text-primary" style={{ fontWeight: 600 }}>{item.row.name}</td>
                            <td className="text-center px-4 py-3 tabular-nums text-accent-700" style={{ fontWeight: 700 }}><RollingText value={formatScore(item.value)} /></td>
                            <td className="w-[78px] whitespace-nowrap px-2 py-3 text-center">
                              <GradeBadge band={getBandKey(item.value, bandLines)} labels={bandLabels} />
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
                                className="mx-auto inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] px-2.5 text-caption-1-semibold text-text-secondary transition-colors hover:bg-background-secondary-default hover:text-text-primary disabled:text-text-tertiary"
                                title={item.matchedStudent ? "查看 AI 建议" : "未匹配到学生档案"}
                              >
                                <Sparkles className="h-3.5 w-3.5 text-status-ai-500" />AI 建议
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
            <div className="flex flex-col gap-5">
              <TrendDashboard exams={exams} subjects={visibleTrendSubjects} />
            </div>
            {trendFollowupCandidates.length > 0 && (
              <div className="rounded-2xl border border-[var(--app-border)] bg-background-primary-default p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-headline-semibold text-text-primary">AI 跟进候选</h3>
                    <p className="mt-0.5 text-body-regular text-text-tertiary">按最近两次考试班排变化挑出需要先看的学生，分数仅作说明</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-status-ai-500" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {trendFollowupCandidates.map(item => (
                    <button
                      key={item.student.id}
                      onClick={() => onOpenStudentFollowup(item.student)}
                      className="group rounded-2xl border border-separator-border bg-background-secondary-default p-3 text-left transition-[background-color,border-color,box-shadow] duration-200 hover:border-border-button-hover hover:bg-background-primary-default hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-body-semibold text-text-primary">{item.student.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-caption-1-semibold ${item.diff !== null && item.diff < 0 ? "bg-status-danger-50 text-status-danger-500" : "bg-background-tertiary-default text-text-tertiary"}`}>
                          {item.diff !== null ? `↓${Math.abs(item.diff)}名` : "关注"}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-caption-1-regular leading-5 text-text-secondary">{item.reason}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary opacity-80 group-hover:text-text-secondary group-hover:opacity-100">
                        <Sparkles className="h-3.5 w-3.5 text-status-ai-500" />打开跟进建议
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </MotionSwitch>
      <ToolPopover open={activeTab === "single" && thresholdOpen} title="成绩阈值" anchorId={THRESHOLD_TRIGGER_ID} onClose={() => setThresholdOpen(false)} widthClassName="w-[22rem]">
        <div className="space-y-5">
          <section aria-label="单科得分率">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-caption-1-semibold text-text-secondary">单科得分率</h3>
              {metricKey !== "total" && <span className="text-caption-1-regular tabular-nums text-text-tertiary">{metricKey} · 满分 {formatScoreValue(metricFullScore)}</span>}
            </div>
            <ThresholdRows scopeLabel="单科" rates={subjectRates} lines={metricKey === "total" ? null : scoreLines} onChange={(key, value) => updateThreshold("subject", key, value)} />
          </section>
          <section aria-label="总分得分率">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-caption-1-semibold text-text-secondary">总分 <span className="tabular-nums text-text-tertiary">· 满分 {formatScoreValue(totalFullScore)}</span></h3>
              <Checkbox isSelected={Boolean(thresholds.total)} onChange={setTotalIndependent}>单独设置</Checkbox>
            </div>
            <MotionCollapse open={Boolean(thresholds.total)}>
              <ThresholdRows scopeLabel="总分" rates={totalRates} lines={totalScoreLines} onChange={(key, value) => updateThreshold("total", key, value)} />
            </MotionCollapse>
            <MotionCollapse open={!thresholds.total}>
              <p className="text-caption-1-regular tabular-nums text-text-tertiary">沿用单科得分率：{formatBandLines(totalScoreLines)}</p>
            </MotionCollapse>
          </section>
          {onFullScoresChange && subjects.length > 0 && (
            <section aria-label="本场各科满分">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-caption-1-semibold text-text-secondary">本场满分</h3>
                {subjects.some(subject => !selectedExam.fullScores?.[subject]) && <span className="text-caption-1-regular text-text-tertiary">未确认的科目按最高分推断</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {subjects.map(subject => (
                  <div key={subject} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-body-regular text-text-secondary">{subject}</span>
                    <NumberStepper value={subjectFullScores[subject] ?? 100} onChange={value => updateFullScore(subject, value)} min={1} max={999} ariaLabel={`${subject}满分`} />
                  </div>
                ))}
              </div>
              {fullScoreError && <InlineStatus message={fullScoreError} tone="error" className="mt-2" />}
            </section>
          )}
        </div>
      </ToolPopover>
      <DialogPresence open={exportOpen}>
      {exportOpen && (
        <GradeExportModal
          exams={exams}
          students={students}
          thresholds={thresholds}
          onClose={() => setExportOpen(false)}
        />
      )}
      </DialogPresence>
    </div>
  );
}
