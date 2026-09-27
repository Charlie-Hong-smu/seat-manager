import type { GradeExam, GradeRow } from "./types";
import type { GradeThresholdRates, GradeThresholds } from "./teacherWorkbench";

export type GradeBandKey = "excellent" | "good" | "pass" | "fail";
export type GradeBandMode = "score" | "rank";

/** 三条分界线（分数），分数 ≥ 分界线即进入对应档。 */
export interface GradeBandLines {
  pass: number;
  good: number;
  excellent: number;
}

export interface ScoreHistogramBin {
  from: number;
  to: number;
  /** 最后一格包含上限，其余格为左闭右开。 */
  inclusiveEnd: boolean;
  count: number;
  band: GradeBandKey;
}

export const GRADE_BAND_ORDER: GradeBandKey[] = ["excellent", "good", "pass", "fail"];
export const SCORE_BAND_LABELS: Record<GradeBandKey, string> = { excellent: "优秀", good: "良好", pass: "及格", fail: "不及格" };
/** 名次分层固定为前 10% / 前 30% / 后 20%，中间为中段。 */
export const RANK_TIER_PERCENTS = { top: 10, upper: 30, bottom: 20 } as const;
export const RANK_BAND_LABELS: Record<GradeBandKey, string> = {
  excellent: `前${RANK_TIER_PERCENTS.top}%`,
  good: `前${RANK_TIER_PERCENTS.upper}%`,
  pass: "中段",
  fail: `后${RANK_TIER_PERCENTS.bottom}%`,
};

const MAX_FULL_SCORE = 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatScoreValue(value: number): string {
  return String(round1(value));
}

/** 按本场最高分推断满分：≤100 视为百分制，≤150 视为 150 分制，更高按 50 分取整。 */
export function inferFullScore(maxScore: number | null): number {
  if (maxScore === null || maxScore <= 100) return 100;
  if (maxScore <= 150) return 150;
  return Math.min(MAX_FULL_SCORE, Math.ceil(maxScore / 50) * 50);
}

export function normalizeFullScores(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => Boolean(entry[0]) && isScore(entry[1]) && entry[1] > 0)
    .map(([subject, score]) => [subject, Math.min(MAX_FULL_SCORE, Math.round(score))] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function getSubjectFullScore(exam: Pick<GradeExam, "rows" | "fullScores">, subject: string): number {
  const configured = exam.fullScores?.[subject];
  if (isScore(configured) && configured > 0) return configured;
  const values = exam.rows.map(row => row.scores[subject]?.score).filter(isScore);
  return inferFullScore(values.length ? Math.max(...values) : null);
}

export function getExamFullScores(exam: Pick<GradeExam, "rows" | "fullScores" | "subjects">): Record<string, number> {
  return Object.fromEntries(exam.subjects.map(subject => [subject, getSubjectFullScore(exam, subject)]));
}

export function getExamTotalFullScore(exam: Pick<GradeExam, "rows" | "fullScores" | "subjects">): number {
  return Math.max(1, exam.subjects.reduce((sum, subject) => sum + getSubjectFullScore(exam, subject), 0));
}

export function getRowTotalScore(row: GradeRow): number | null {
  if (isScore(row.total)) return row.total;
  const values = Object.values(row.scores).map(cell => cell.score).filter(isScore);
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0)) : null;
}

export function resolveThresholdRates(thresholds: GradeThresholds, metric: "total" | "subject"): GradeThresholdRates {
  const source = metric === "total" && thresholds.total ? thresholds.total : thresholds;
  return { pass: source.pass, good: source.good, excellent: source.excellent };
}

export function getScoreBandLines(rates: GradeThresholdRates, fullScore: number): GradeBandLines {
  return {
    pass: round1((rates.pass / 100) * fullScore),
    good: round1((rates.good / 100) * fullScore),
    excellent: round1((rates.excellent / 100) * fullScore),
  };
}

export function getBandKey(value: number | null, lines: GradeBandLines): GradeBandKey | null {
  if (value === null) return null;
  if (value >= lines.excellent) return "excellent";
  if (value >= lines.good) return "good";
  if (value >= lines.pass) return "pass";
  return "fail";
}

/**
 * 名次分层的分界线取各层最低分：同分者进入同一层（可能略超比例），
 * 保证分层只由分数决定，和分数分布图的切分一致。
 */
export function getRankTierLines(values: number[]): GradeBandLines | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => b - a);
  const n = sorted.length;
  const topCount = Math.max(1, Math.ceil((n * RANK_TIER_PERCENTS.top) / 100));
  const upperCount = Math.max(topCount, Math.ceil((n * RANK_TIER_PERCENTS.upper) / 100));
  const nonBottomCount = Math.max(upperCount, n - Math.ceil((n * RANK_TIER_PERCENTS.bottom) / 100));
  return {
    excellent: sorted[topCount - 1],
    good: sorted[upperCount - 1],
    pass: sorted[nonBottomCount - 1],
  };
}

/** 约 20 格：百分制 5 分一格，150 分制 10 分一格，总分按满分放大。 */
export function pickHistogramBinWidth(fullScore: number): number {
  const target = fullScore / 20;
  return [1, 2, 5, 10, 20, 25, 50, 100].find(step => step >= target) ?? Math.ceil(target / 100) * 100;
}

/**
 * 固定宽度分箱，并在分界线处额外切开，使每一格只属于一个档，颜色与人数统计严格一致。
 * 下限从最低分所在格开始，避免大段空白挤压有效区间。
 * `extraEdges` 让另一种分档方式的分界线也参与切分，两种方式共用同一组柱形，切换时只换颜色。
 */
export function buildScoreHistogram(values: number[], fullScore: number, lines: GradeBandLines, extraEdges: number[] = []): ScoreHistogramBin[] {
  if (!values.length) return [];
  const width = pickHistogramBinWidth(fullScore);
  const upper = Math.max(fullScore, ...values);
  const start = Math.max(0, Math.floor(Math.min(...values) / width) * width);
  const edges = new Set<number>([upper]);
  for (let edge = start; edge < upper; edge += width) edges.add(round1(edge));
  [lines.pass, lines.good, lines.excellent, ...extraEdges].forEach(line => { if (line > start && line < upper) edges.add(line); });
  const sorted = [...edges].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((from, index) => {
    const to = sorted[index + 1];
    const inclusiveEnd = index === sorted.length - 2;
    return {
      from,
      to,
      inclusiveEnd,
      count: values.filter(value => value >= from && (inclusiveEnd ? value <= to : value < to)).length,
      band: getBandKey(from, lines) ?? "fail",
    };
  });
}

export function countBands(values: Array<number | null>, lines: GradeBandLines): Record<GradeBandKey | "missing", number> {
  const counts = { excellent: 0, good: 0, pass: 0, fail: 0, missing: 0 };
  values.forEach(value => { counts[getBandKey(value, lines) ?? "missing"] += 1; });
  return counts;
}
